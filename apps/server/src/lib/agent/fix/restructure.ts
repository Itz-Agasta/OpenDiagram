import type { DiagramEdge, DiagramSpec } from "@OpenDiagram/harness";
import { z } from "zod";

// No junction op: the model named the new node ("C-Suite") and a blind judge
// read it as invented structure. Needs an unlabelled dot node in the renderer first.
// One flat object, not a discriminated union: Gemini's schema subset handles
// optional fields reliably and anyOf less so.
export const restructureOp = z.object({
  op: z.enum(["regroup", "merge_edges", "arrange"]),
  node: z.string().optional().describe("regroup: the node to move"),
  group: z.string().optional().describe('regroup: target group id, "" for top level'),
  edges: z.array(z.string()).optional().describe("merge_edges: edges with the same from and to"),
  rows: z
    .array(z.array(z.string()))
    .optional()
    .describe('arrange: a grid of node ids, one array per row, "" for an empty cell'),
  center: z.string().optional().describe("arrange: a hub node; the rest go on a ring around it"),
});
export type RestructureOp = z.infer<typeof restructureOp>;

type Edge = DiagramEdge & { id: string };

const joinLabels = (edges: Edge[]) =>
  [...new Set(edges.flatMap((e) => (e.label ? [e.label] : [])))].join(" / ") || undefined;

/**
 * Applies structure ops to a spec. Content is never dropped: merges keep every
 * distinct label, regroup only moves membership, arrange only places. Returns
 * the new spec, or an error string the model reads.
 */
export function restructure(
  spec: DiagramSpec,
  ops: RestructureOp[],
): { spec: DiagramSpec; relayout: boolean } | string {
  let edges = spec.edges.map((e) => ({ ...e })) as Edge[];
  const nodes = spec.nodes;
  let groups = (spec.groups ?? []).map((g) => ({ ...g, contains: [...g.contains] }));
  let meta = spec.meta;
  let relayout = false;
  const byId = (ids: string[] = []) => {
    const found = edges.filter((e) => ids.includes(e.id));
    return found.length === ids.length ? found : undefined;
  };

  for (const op of ops) {
    // No direction op: flipping the flow overrode a TD the user had asked for
    // (measured, mermaid flowchart). The main agent owns direction.
    if (op.op === "arrange" && (op.rows?.length || op.center)) {
      // A grid throws lanes away: the judge scored every swimlane re-arrange worse.
      if (groups.some((g) => g.style === "swimlane") || spec.type === "bpmn")
        return "arrange refused: swimlane diagrams keep their lanes; move nodes inside them instead";
      const named = [...(op.rows?.flat() ?? []), op.center ?? ""].filter(Boolean);
      const unknown = named.filter((id) => !nodes.some((n) => n.id === id));
      if (unknown.length) return `arrange: unknown nodes ${unknown.join(", ")}`;
      meta = { ...meta, arrange: op.rows?.length ? { rows: op.rows } : { center: op.center } };
      relayout = true;
    } else if (op.op === "regroup" && op.node) {
      if (!nodes.some((n) => n.id === op.node)) return `unknown node ${op.node}`;
      if (op.group && !groups.some((g) => g.id === op.group)) return `unknown group ${op.group}`;
      groups = groups.map((g) => ({
        ...g,
        contains:
          g.id === op.group
            ? [...g.contains.filter((id) => id !== op.node), op.node!]
            : g.contains.filter((id) => id !== op.node),
      }));
    } else if (op.op === "merge_edges") {
      const group = byId(op.edges);
      if (!group || group.length < 2) return `merge_edges needs 2+ known edge ids`;
      const [first] = group;
      if (!group.every((e) => e.from === first!.from && e.to === first!.to))
        return `merge_edges: ${op.edges!.join(",")} do not all share the same from and to`;
      const merged = { ...first!, label: joinLabels(group) };
      edges = edges.filter((e) => !group.includes(e)).concat(merged);
    } else return `bad op ${JSON.stringify(op)}`;
  }

  const labels = (es: DiagramEdge[]) => es.flatMap((e) => (e.label ? [e.label] : []));
  const now = labels(edges).join("\n");
  const lost = labels(spec.edges).filter((l) => !now.includes(l));
  if (lost.length) return `refused: would drop labels ${lost.join(", ")}`;
  return { spec: { ...spec, nodes, edges, groups, meta }, relayout };
}
