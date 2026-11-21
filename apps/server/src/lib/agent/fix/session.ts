import {
  layoutDiagram,
  layoutPinned,
  type DiagramSpec,
  type EdgeSides,
  type PositionedSpec,
  type Theme,
} from "@OpenDiagram/harness";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { FixEvent, FixOptions } from "./index";
import { restructure, restructureOp } from "./restructure";
import { hardFaults, headline, issues, layoutCost } from "./view";

const face = z.enum(["top", "right", "bottom", "left"]);

/** "A", "A and B", "A, B and 2 more": a step line stays one short row in the chat. */
function names(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  const shown = labels.slice(0, 2).join(", ");
  return labels.length === 3
    ? `${shown} and ${labels[2]}`
    : `${shown} and ${labels.length - 2} more`;
}

interface FixState {
  current: PositionedSpec;
  spec: DiagramSpec;
  sides: Record<string, EdgeSides>;
  safe: { positioned: PositionedSpec; spec: DiagramSpec; sides: Record<string, EdgeSides> };
}

export interface FixSession {
  state: FixState;
  calls: { move: number; route: number; restructure: number; reverted: number };
  tools: ToolSet;
  hardBefore: number;
}

/**
 * One fix pass's mutable state and the tools the model edits it with. Every
 * tool re-solves through the harness, judges the result, and reports one line
 * to `emit` for the chat. `state.current` is what the drawing is now.
 */
export function createFixSession(
  drawn: PositionedSpec,
  working: DiagramSpec,
  theme: Theme,
  options: FixOptions,
  emit: (event: FixEvent) => void,
): FixSession {
  const before = { hard: hardFaults(drawn, theme) };
  const state: FixState = {
    current: drawn,
    spec: working,
    sides: {},
    // Latest state no worse in hard faults than the start: where an "end" judge lands.
    safe: { positioned: drawn, spec: working, sides: {} },
  };
  const calls = { move: 0, route: 0, restructure: 0, reverted: 0 };
  const label = (id: string) =>
    [...state.spec.nodes, ...(state.spec.groups ?? []), ...(state.spec.zones ?? [])].find(
      (x) => x.id === id,
    )?.label ?? id;

  const judge = (next: PositionedSpec): string | undefined => {
    if (options.judge === "strict") {
      const [was, now] = [layoutCost(state.current, theme), layoutCost(next, theme)];
      return now < was ? `score ${was} -> ${now}` : undefined;
    }
    const [was, now] = [hardFaults(state.current, theme), hardFaults(next, theme)];
    return now > was ? `hard faults ${was} -> ${now}` : undefined;
  };

  const commit = (
    step: string,
    next: PositionedSpec,
    nextSpec: DiagramSpec,
    nextSides = state.sides,
  ): string => {
    if (options.judge === "end") {
      const was = layoutCost(state.current, theme);
      [state.current, state.spec, state.sides] = [next, nextSpec, nextSides];
      const hard = hardFaults(next, theme);
      if (hard <= before.hard) state.safe = { positioned: next, spec: nextSpec, sides: nextSides };
      emit({ kind: "step", text: step });
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
      emit({ kind: "step", text: `${step} (undone)` });
      return `REVERTED (${worse}). Nothing changed. Try something else.`;
    }
    const was = layoutCost(state.current, theme);
    [state.current, state.spec, state.sides] = [next, nextSpec, nextSides];
    emit({ kind: "step", text: step });
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
          const known = moves.filter((m) => state.current.positions[m.id]);
          const at = Object.fromEntries(known.map((m) => [m.id, m]));
          const { spec, current, sides } = state;
          return commit(
            `Moved ${names(known.map((m) => label(m.id)))}`,
            layoutPinned(spec, at, current.positions, theme, sides),
            spec,
          );
        },
      }),
      // One atomic step for a whole frame: moving its boxes one call at a time
      // passed through label collisions and the judge undid every attempt.
      move_group: tool({
        description: "Shift every node inside each group by dx,dy pixels. Several groups per call.",
        inputSchema: z.object({
          shifts: z.array(z.object({ id: z.string(), dx: z.number(), dy: z.number() })),
        }),
        execute: async ({ shifts }) => {
          calls.move++;
          const { spec, current, sides } = state;
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
          const groups = shifts.map((s) => label(s.id));
          return commit(
            `Shifted the ${names(groups)} ${groups.length > 1 ? "groups" : "group"}`,
            layoutPinned(spec, at, current.positions, theme, sides),
            spec,
          );
        },
      }),
    }),
    ...(options.tools.includes("route") && {
      route_edge: tool({
        description:
          "Pin which side of its source box an arrow leaves (from) and which side of its target it enters (to). Omit a side to let the router choose it.",
        inputSchema: z.object({
          routes: z.array(z.object({ id: z.string(), from: face.optional(), to: face.optional() })),
        }),
        execute: async ({ routes }) => {
          calls.route++;
          const next = { ...state.sides };
          for (const r of routes) next[r.id] = { from: r.from, to: r.to };
          const { spec, current } = state;
          return commit(
            "Re-routed arrows",
            layoutPinned(spec, {}, current.positions, theme, next),
            spec,
            next,
          );
        },
      }),
    }),
    ...(options.tools.includes("restructure") && {
      restructure: tool({
        description: "Change the diagram's structure without dropping content. Ops apply in order.",
        inputSchema: z.object({ ops: z.array(restructureOp) }),
        execute: async ({ ops }) => {
          calls.restructure++;
          const r = restructure(state.spec, ops);
          if (typeof r === "string") return `ERROR: ${r}`;
          const kept = new Set(r.spec.edges.map((e) => e.id));
          const nextSides = r.relayout
            ? {}
            : Object.fromEntries(Object.entries(state.sides).filter(([k]) => kept.has(k)));
          const next = r.relayout
            ? await layoutDiagram(r.spec, theme)
            : layoutPinned(r.spec, {}, state.current.positions, theme, nextSides);
          // The harness drops a frame whose members collide with another's or
          // that a regroup emptied: the grouping would silently vanish.
          const lost = Object.keys(state.current.groupBoxes).filter((g) => !next.groupBoxes[g]);
          if (lost.length)
            return `REFUSED: that change drops group frames ${lost.join(", ")}. Keep each group's members together, and never empty a group.`;
          return commit("Restructured the diagram", next, r.spec, nextSides);
        },
      }),
    }),
  };

  return { state, calls, tools, hardBefore: before.hard };
}
