import {
  edgeLabelText,
  type DiagramSpec,
  type PositionedSpec,
  type Theme,
} from "@OpenDiagram/harness";
import { generateText, isStepCount, type LanguageModel, type ModelMessage } from "ai";
import type { RequestLogger } from "evlog";
import type { AiUsage } from "../../quota/enforce";
import { aiTelemetry } from "../../telemetry";
import { instructions } from "./prompt";
import { compare, triage } from "./self-check";
import { createFixSession } from "./session";
import { hardFaults, layoutCost, layoutLints, picture, textView } from "./view";

/** One line of what the fixer is doing, for the chat while it works. */
export type FixEvent =
  | { kind: "look"; text: string }
  | { kind: "step"; text: string }
  | { kind: "verdict"; text: string };

/** Repairs a drawn diagram, or hands the same one back. Never drops content. */
export type LayoutFixer = (
  spec: DiagramSpec,
  drawn: PositionedSpec,
  onEvent?: (event: FixEvent) => void,
  /** Set when this drawing is one view of several `draw_system` planned. */
  part?: { index: number; count: number },
) => Promise<{ spec: DiagramSpec; positioned: PositionedSpec; stats: FixStats }>;

/**
 * What one pass did, for the caller to log. Returned rather than `log.set`
 * here: draw_system runs a pass per view on one logger, and each view's
 * fields overwrote the last.
 */
export interface FixStats {
  /** The first look's verdict, when the numbers alone did not decide. */
  triage?: { polish: boolean; problems: string };
  /** Present once a fix pass ran. */
  fix?: Record<string, unknown>;
}

/**
 * The request as one view should read it. Without the note, a flow view of a
 * multi-view system was judged against the whole request and the first look
 * reported every component drawn in the other views as "entirely missing"
 * (gemini-3.8-flash, food delivery flow view: 3/3 runs, 0/3 with the note).
 * The request stays: placement asks still apply to every view.
 */
function requestFor(
  request: string | undefined,
  title: string,
  part: { index: number; count: number } | undefined,
): string | undefined {
  if (!request || !part || part.count < 2) return request;
  // First, not last: the prompts cut the request at 2-3k chars.
  return `THIS DRAWING is "${title}", view ${part.index + 1} of ${part.count} of the system below (an overview plus one view per flow). It shows only part of what was asked, on purpose: judge its layout, not whether everything requested appears in it.\n\n${request}`;
}

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

const RENDER_CAPTION = "The drawing now:";
const isRender = (m: ModelMessage) =>
  m.role === "user" &&
  Array.isArray(m.content) &&
  m.content[0]?.type === "text" &&
  m.content[0].text === RENDER_CAPTION;

/**
 * The first look as chat rows: its first two findings, in the user's labels.
 * Triage writes a paragraph naming things by id ("Edge e8 (Track) stretches
 * across the canvas; cdn is stranded ...").
 */
function findings(text: string, drawn: PositionedSpec): string[] {
  const labels = new Map(
    [...drawn.nodes, ...(drawn.groups ?? []), ...(drawn.zones ?? [])].map((x) => [x.id, x.label]),
  );
  const arrows = new Map(drawn.edges.map((e) => [e.id, edgeLabelText(e)]));
  const escape = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Longest first, so `api` never matches inside `api-gateway`.
  const ids = [...labels.keys(), ...arrows.keys()]
    .filter((id): id is string => !!id)
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?:\\b(?:[Ee]dge|[Aa]rrow)\\s+)?(?<![\\w-])(${ids.map(escape).join("|") || "(?!)"})(?![\\w-])(?:\\s*\\(([^)]+)\\))?`,
    "g",
  );
  const name = (match: string, id: string, paren?: string) => {
    if (arrows.has(id)) {
      const label = paren ?? arrows.get(id);
      return label ? `the ${label} arrow` : "an arrow";
    }
    // A leading "edge " that matched before a node id is prose; keep it.
    const label = labels.get(id);
    return label ? match.replace(id, () => label) : match;
  };
  return text
    .split(/;|\.\s|\n/)
    .map((part) => part.trim().replace(pattern, name))
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => {
      const line = part[0]!.toUpperCase() + part.slice(1).replace(/\.$/, "");
      return line.length > 110 ? `${line.slice(0, 110).replace(/\s+\S*$/, "")}…` : line;
    });
}

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
  return async (input, drawn, emit = () => {}, part) => {
    const asked = requestFor(request, input.title, part);
    const cost = layoutCost(drawn, theme);
    const lintsBefore = layoutLints(drawn, theme).length;
    const stats: FixStats = {};
    const unchanged = () => ({ spec: input, positioned: drawn, stats });
    if (input.nodes.length < 3) return unchanged();
    const numbers = cost < FIX_BELOW || hardFaults(drawn, theme) > 0 || lintsBefore >= SLOP_LINTS;
    let seen: string | undefined;
    if (!numbers) {
      if (!options.picture) return unchanged();
      const look = await triage(model, providerOptions, drawn, asked, usage, theme).catch(
        (error) => {
          log.warn("fix triage failed, skipping the fix", { error: String(error) });
          return { polish: false, problems: "" };
        },
      );
      stats.triage = look;
      if (!look.polish) return unchanged();
      seen = look.problems;
    }

    // Edges carry layout-assigned ids from here on; the model names them.
    // Without a picture there is nothing to look at: a missing resvg binary or
    // font must cost the polish, never the diagram.
    let firstPicture: Uint8Array | undefined;
    if (options.picture) {
      try {
        firstPicture = picture(drawn, theme);
      } catch (error) {
        log.warn("fix preview failed, skipping the fix", { error: String(error) });
        return unchanged();
      }
    }
    const looked = seen ? findings(seen, drawn) : [];
    for (const text of looked.length ? looked : ["The layout check found overlaps or tangles"])
      emit({ kind: "look", text });
    const working: DiagramSpec = { ...input, edges: drawn.edges };
    const session = createFixSession(drawn, working, theme, options, emit);
    const { state, calls } = session;
    const started = performance.now();

    const ask = asked ? `THE USER ASKED FOR:\n"""\n${asked.slice(0, 3000)}\n"""\n\n` : "";
    const first: ModelMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: `${ask}${seen ? `A FIRST LOOK FOUND:\n${seen}\n\n` : ""}${textView(drawn, theme, options.lints)}`,
        },
        ...(options.picture
          ? [{ type: "file" as const, data: firstPicture!, mediaType: "image/png" }]
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
        // Only the latest render rides along. A prepareStep override carries
        // forward to later steps, so earlier renders are dropped here first.
        prepareStep: ({ stepNumber, messages }) =>
          options.picture && stepNumber > 0
            ? {
                messages: [
                  ...messages.filter((m) => !isRender(m)),
                  {
                    role: "user",
                    content: [
                      { type: "text", text: RENDER_CAPTION },
                      { type: "file", data: picture(state.current, theme), mediaType: "image/png" },
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
        tools: session.tools,
      });
    } catch (error) {
      log.warn("layout fix pass failed, keeping what it reached", { error: String(error) });
    }
    if (options.judge === "end" && hardFaults(state.current, theme) > session.hardBefore) {
      calls.reverted++;
      ({ positioned: state.current, spec: state.spec, sides: state.sides } = state.safe);
    }
    let kept: "fix" | "start" | undefined;
    if (options.selfCheck && state.current !== drawn) {
      kept = await compare(model, providerOptions, drawn, state.current, asked, usage, theme).catch(
        (error) => {
          log.warn("fix self-check failed, keeping the fix", { error: String(error) });
          return undefined;
        },
      );
      if (kept === "start") [state.current, state.spec] = [drawn, working];
    }
    emit({
      kind: "verdict",
      text: state.current === drawn ? "Kept the first draw" : "Kept the polished layout",
    });
    stats.fix = {
      before: cost,
      after: layoutCost(state.current, theme),
      hardBefore: session.hardBefore,
      hardAfter: hardFaults(state.current, theme),
      lintsBefore,
      lintsAfter: layoutLints(state.current, theme).length,
      kept,
      ...calls,
      ms: Math.round(performance.now() - started),
    };
    // Moves never touch the spec. Hand back the caller's own spec unless a
    // restructure changed it: the working copy carries sanitized edges.
    return {
      spec: state.spec === working ? input : state.spec,
      positioned: state.current,
      stats,
    };
  };
}
