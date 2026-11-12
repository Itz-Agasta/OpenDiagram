import {
  layoutDiagram,
  layoutPinned,
  type DiagramSpec,
  type EdgeSides,
  type PositionedSpec,
  type Theme,
} from "@OpenDiagram/harness";
import { generateText, isStepCount, tool, type LanguageModel, type ModelMessage } from "ai";
import type { RequestLogger } from "evlog";
import { z } from "zod";
import type { AiUsage } from "../../quota/enforce";
import { aiTelemetry } from "../../telemetry";
import { restructure, restructureOp } from "./restructure";
import { instructions } from "./prompt";
import { compare, triage } from "./self-check";
import { hardFaults, headline, issues, layoutCost, layoutLints, picture, textView } from "./view";

/** Repairs a drawn diagram, or hands the same one back. Never drops content. */
export type LayoutFixer = (
  spec: DiagramSpec,
  drawn: PositionedSpec,
) => Promise<{ spec: DiagramSpec; positioned: PositionedSpec }>;

export interface FixOptions {
  /** Show the model a render of the drawing, refreshed after every change. */
  picture: boolean;
  tools: ("move" | "route" | "restructure")[];
  /** Arrow and container lints in the text view. */
  lints: boolean;
  /** strict: revert any step that lowers the score. hard: only one that adds hard faults. */
  /**
   * strict: undo a step that lowers the score. hard: undo a step that adds hard
   * faults. end: every step stands; the fix ends on its latest state with no
   * more hard faults than the start (lets a reshape pass through a collision).
   */
  judge: "strict" | "hard" | "end";
  maxSteps: number;
  /** At the end the model compares start and final pictures; keeps the start if it reads better. */
  selfCheck?: boolean;
}

/**
 * Measured (notes: agent-canvas-v3), blind-judged against the start: picture +
 * moves + self-check regressed 1 of 51 with a per-step hard judge; moving that
 * judge to the end (C4) went 32 better / 0 worse of 48 against 30 / 5, because
 * a group reshape can pass through a collision. route/restructure stay opt-in.
 */
const DEFAULT_FIX: FixOptions = {
  picture: true,
  tools: ["move"],
  lints: true,
  judge: "end",
  maxSteps: 6,
  selfCheck: true,
};

// Below this the draw is worth a repair pass without asking. Above it, hard
// faults or 3+ lints still trigger one, and otherwise the model looks at the
// picture first: a Twitter diagram scored 84 with a stranded node, labels on
// frame borders and lines riding the frame, and the numbers alone let it pass.
const FIX_BELOW = 70;
const SLOP_LINTS = 3;

const face = z.enum(["top", "right", "bottom", "left"]);

/**
 * The polish pass behind `AGENT_FIX_LAYOUT`: the harness has drawn, a model
 * looks at it (a render plus a text view with ids) and fixes what looks bad by
 * hand: moves boxes, picks arrow sides, restructures. The harness still owns
 * routing, sizing and styling, re-solves after every change, and reverts a
 * change that adds hard faults. Model failures are swallowed: a missing polish
 * must not cost the user their diagram. Every token is added to `usage`, the
 * turn's side ledger, so the fix is billed with the turn.
 */
export function createLayoutFixer(
  model: LanguageModel,
  theme: Theme,
  log: RequestLogger,
  usage: Required<AiUsage>,
  request?: string,
  options: FixOptions = DEFAULT_FIX,
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"],
): LayoutFixer {
  return async (input, drawn) => {
    const before = { cost: layoutCost(drawn, theme), hard: hardFaults(drawn, theme) };
    const lintsBefore = layoutLints(drawn, theme).length;
    if (input.nodes.length < 3) return { spec: input, positioned: drawn };
    const numbers = before.cost < FIX_BELOW || before.hard > 0 || lintsBefore >= SLOP_LINTS;
    let seen: string | undefined;
    if (!numbers) {
      if (!options.picture) return { spec: input, positioned: drawn };
      const look = await triage(model, providerOptions, drawn, request, usage, theme).catch(
        (error) => {
          log.warn("fix triage failed, skipping the fix", { error: String(error) });
          return { polish: false, problems: "" };
        },
      );
      log.set({ fixTriage: look });
      if (!look.polish) return { spec: input, positioned: drawn };
      seen = look.problems;
    }

    // Edges carry layout-assigned ids from here on; the model names them.
    let spec: DiagramSpec = { ...input, edges: drawn.edges };
    let current = drawn;
    let sides: Record<string, EdgeSides> = {};
    const calls = { move: 0, route: 0, restructure: 0, reverted: 0 };
    const started = performance.now();

    const judge = (next: PositionedSpec): string | undefined => {
      if (options.judge === "strict") {
        const [was, now] = [layoutCost(current, theme), layoutCost(next, theme)];
        return now < was ? `score ${was} -> ${now}` : undefined;
      }
      const [was, now] = [hardFaults(current, theme), hardFaults(next, theme)];
      return now > was ? `hard faults ${was} -> ${now}` : undefined;
    };
    // Latest state no worse in hard faults than the start: where an "end" judge lands.
    let safe = { positioned: drawn, spec, sides };
    const commit = (next: PositionedSpec, nextSpec: DiagramSpec, nextSides = sides): string => {
      if (options.judge === "end") {
        const was = layoutCost(current, theme);
        [current, spec, sides] = [next, nextSpec, nextSides];
        const hard = hardFaults(next, theme);
        if (hard <= before.hard) safe = { positioned: next, spec, sides };
        const warn =
          hard > before.hard
            ? `WARNING: ${hard - before.hard} more hard faults than the start (see ISSUES). Fix them in your next move, or this state is dropped at the end.`
            : "";
        return [`applied: score ${was} -> ${layoutCost(next, theme)}`, warn, headline(next, theme)]
          .concat(issues(next, theme, options.lints))
          .filter(Boolean)
          .join("\n");
      }
      const worse = judge(next);
      if (worse) {
        calls.reverted++;
        return `REVERTED (${worse}). Nothing changed. Try something else.`;
      }
      const was = layoutCost(current, theme);
      [current, spec, sides] = [next, nextSpec, nextSides];
      return [`applied: score ${was} -> ${layoutCost(next, theme)}`, headline(next, theme)]
        .concat(issues(next, theme, options.lints))
        .join("\n");
    };

    const tools = {
      ...(options.tools.includes("move") && {
        move_nodes: tool({
          description: "Move nodes to absolute top-left positions in pixels. Several per call.",
          inputSchema: z.object({
            moves: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })),
          }),
          execute: async ({ moves }) => {
            calls.move++;
            const at = Object.fromEntries(
              moves.filter((m) => current.positions[m.id]).map((m) => [m.id, m]),
            );
            return commit(layoutPinned(spec, at, current.positions, theme, sides), spec);
          },
        }),
      }),
      ...(options.tools.includes("move") && {
        // One atomic step for a whole frame: moving its boxes one call at a time
        // passed through label collisions and the judge undid every attempt.
        move_group: tool({
          description:
            "Shift every node inside each group by dx,dy pixels. Several groups per call.",
          inputSchema: z.object({
            shifts: z.array(z.object({ id: z.string(), dx: z.number(), dy: z.number() })),
          }),
          execute: async ({ shifts }) => {
            calls.move++;
            const containers = [...(spec.groups ?? []), ...(spec.zones ?? [])];
            const nodesOf = (id: string, seen = new Set<string>()): string[] => {
              if (seen.has(id)) return [];
              seen.add(id);
              const c = containers.find((x) => x.id === id);
              if (!c) return current.positions[id] ? [id] : [];
              return c.contains.flatMap((m) => nodesOf(m, seen));
            };
            const at: Record<string, { x: number; y: number }> = {};
            const unknown: string[] = [];
            for (const { id, dx, dy } of shifts) {
              if (!containers.some((c) => c.id === id)) unknown.push(id);
              for (const n of nodesOf(id)) {
                const b = current.positions[n]!;
                at[n] = { x: b.x + dx, y: b.y + dy };
              }
            }
            if (unknown.length) return `ERROR: unknown groups ${unknown.join(", ")}`;
            return commit(layoutPinned(spec, at, current.positions, theme, sides), spec);
          },
        }),
      }),
      ...(options.tools.includes("route") && {
        route_edge: tool({
          description:
            "Pin which side of its source box an arrow leaves (from) and which side of its target it enters (to). Omit a side to let the router choose it.",
          inputSchema: z.object({
            routes: z.array(
              z.object({ id: z.string(), from: face.optional(), to: face.optional() }),
            ),
          }),
          execute: async ({ routes }) => {
            calls.route++;
            const next = { ...sides };
            for (const r of routes) next[r.id] = { from: r.from, to: r.to };
            return commit(layoutPinned(spec, {}, current.positions, theme, next), spec, next);
          },
        }),
      }),
      ...(options.tools.includes("restructure") && {
        restructure: tool({
          description:
            "Change the diagram's structure without dropping content. Ops apply in order.",
          inputSchema: z.object({ ops: z.array(restructureOp) }),
          execute: async ({ ops }) => {
            calls.restructure++;
            const r = restructure(spec, ops);
            if (typeof r === "string") return `ERROR: ${r}`;
            if (r.relayout) {
              const next = await layoutDiagram(r.spec, theme);
              // A grid mixing groups' members makes their frames collide, and the
              // harness drops colliding frames: the grouping silently vanishes.
              const lost = Object.keys(current.groupBoxes).filter((g) => !next.groupBoxes[g]);
              if (lost.length)
                return `REFUSED: that arrangement drops group frames ${lost.join(", ")}. Keep each group's members together in adjacent cells.`;
              return commit(next, r.spec, {});
            }
            const kept = new Set(r.spec.edges.map((e) => e.id));
            const nextSides = Object.fromEntries(
              Object.entries(sides).filter(([k]) => kept.has(k)),
            );
            const next = layoutPinned(r.spec, {}, current.positions, theme, nextSides);
            return commit(next, r.spec, nextSides);
          },
        }),
      }),
    };

    const ask = request ? `THE USER ASKED FOR:\n"""\n${request.slice(0, 3000)}\n"""\n\n` : "";
    const first: ModelMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: `${ask}${seen ? `A FIRST LOOK FOUND:\n${seen}\n\n` : ""}${textView(drawn, theme, options.lints)}`,
        },
        ...(options.picture
          ? [{ type: "file" as const, data: picture(drawn, theme), mediaType: "image/png" }]
          : []),
      ],
    };
    try {
      await generateText({
        model,
        providerOptions,
        instructions: instructions(options),
        messages: [first],
        telemetry: aiTelemetry("diagram-fix-layout"),
        stopWhen: isStepCount(options.maxSteps),
        // Only the latest render rides along, never the history: one picture
        // per step instead of one per change ever made.
        prepareStep: ({ stepNumber, messages }) =>
          options.picture && stepNumber > 0
            ? {
                messages: [
                  ...messages,
                  {
                    role: "user",
                    content: [
                      { type: "text", text: "The drawing now:" },
                      { type: "file", data: picture(current, theme), mediaType: "image/png" },
                    ],
                  },
                ],
              }
            : undefined,
        onStepEnd: ({ usage: step }) => {
          usage.inputTokens += step.inputTokens ?? 0;
          usage.outputTokens += step.outputTokens ?? 0;
          usage.cachedInputTokens += step.inputTokenDetails.cacheReadTokens ?? 0;
        },
        maxOutputTokens: 8192,
        abortSignal: AbortSignal.timeout(120_000),
        tools,
      });
    } catch (error) {
      log.warn("layout fix pass failed, keeping what it reached", { error: String(error) });
    }
    if (options.judge === "end" && hardFaults(current, theme) > before.hard) {
      calls.reverted++;
      ({ positioned: current, spec, sides } = safe);
    }
    let kept: "fix" | "start" | undefined;
    if (options.selfCheck && current !== drawn) {
      kept = await compare(model, providerOptions, drawn, current, request, usage, theme).catch(
        (error) => {
          log.warn("fix self-check failed, keeping the fix", { error: String(error) });
          return undefined;
        },
      );
      if (kept === "start") [current, spec] = [drawn, { ...input, edges: drawn.edges }];
    }
    log.set({
      fix: {
        before: before.cost,
        after: layoutCost(current, theme),
        hardBefore: before.hard,
        hardAfter: hardFaults(current, theme),
        lintsBefore,
        lintsAfter: layoutLints(current, theme).length,
        kept,
        ...calls,
        ms: Math.round(performance.now() - started),
      },
    });
    return { spec, positioned: current };
  };
}
