import type { DiagramEdge, DiagramNode, DiagramSpec } from "../schema.js";
import type { SystemFlow, SystemModel } from "./schema.js";

/**
 * Past this many components one diagram stops being readable: in the OPE-51
 * eval, layout score averaged 85 at <=9 nodes, 65 at 10-12 and 51 at 13+.
 */
export const MAX_DETAIL_NODES = 12;

type Link = Omit<DiagramEdge, "id">;
/** A component's `domain` after normalizing: undefined when shared or not a declared domain. */
type Component = Omit<SystemModel["components"][number], "domain"> & { domain?: string };
type Model = Omit<SystemModel, "components"> & { components: Component[] };

/** Every connection the model states: explicit links, then each flow's steps. */
function allLinks(model: Model): Link[] {
  return [
    ...(model.links ?? []),
    ...model.flows.flatMap((f) => f.steps.map(({ reply: _, ...step }) => step)),
  ];
}

/**
 * One edge per unordered node pair. Opposite directions become one "bi" edge
 * (reverse edges render as loops); a label survives only while every merged
 * link carries the same one, since otherwise the edge has no single honest name.
 */
function mergeLinks(
  links: Link[],
  keep: (id: string) => string | undefined,
): { edge: DiagramEdge; count: number }[] {
  const byPair = new Map<string, { edge: DiagramEdge; count: number }>();
  for (const link of links) {
    const from = keep(link.from);
    const to = keep(link.to);
    if (!from || !to || from === to) continue;
    const key = [from, to].sort().join("\0");
    const seen = byPair.get(key);
    if (!seen) {
      byPair.set(key, { edge: { ...link, from, to }, count: 1 });
      continue;
    }
    seen.count++;
    if (seen.edge.from !== from) seen.edge.direction = "bi";
    if (link.kind !== seen.edge.kind) seen.edge.kind = "sync";
    if (seen.edge.label !== link.label) delete seen.edge.label;
  }
  return [...byPair.values()].map(({ edge, count }, i) => ({
    edge: { ...edge, id: `e${i + 1}` },
    count,
  }));
}

const edgesOf = (merged: { edge: DiagramEdge }[]) => merged.map((m) => m.edge);

/**
 * Heaviest edges (most merged links) that join two still-separate parts come
 * first, so pruning never splits the overview into islands; the rest fill up to
 * `budget` by weight. "Each node keeps its heaviest edge" was tried first and
 * cut a pipeline off from the API that feeds it.
 */
function pruneEdges(merged: { edge: DiagramEdge; count: number }[], budget: number): DiagramEdge[] {
  const byWeight = [...merged].sort((a, b) => b.count - a.count).map((m) => m.edge);
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const r = root(p);
    parent.set(id, r);
    return r;
  };
  const kept = new Set<DiagramEdge>();
  for (const e of byWeight) {
    const [a, b] = [root(e.from), root(e.to)];
    if (a === b) continue;
    parent.set(a, b);
    kept.add(e);
  }
  for (const e of byWeight) if (kept.size < budget) kept.add(e);
  return edgesOf(merged).filter((e) => kept.has(e));
}

function componentNode(c: Component): DiagramNode {
  const { domain: _, icon, ...node } = c;
  return icon && icon !== "none" ? { ...node, icon } : node;
}

/** Everything, domains as groups. Used when the whole system fits one diagram. */
function detailView(model: Model): DiagramSpec {
  const ids = new Set(model.components.map((c) => c.id));
  return {
    type: "system-design",
    title: model.title,
    nodes: model.components.map(componentNode),
    edges: edgesOf(mergeLinks(allLinks(model), (id) => (ids.has(id) ? id : undefined))),
    groups: model.domains
      .map((d) => ({
        id: d.id,
        label: d.label,
        sublabel: d.sublabel,
        contains: model.components.filter((c) => c.domain === d.id).map((c) => c.id),
      }))
      .filter((g) => g.contains.length > 0),
  };
}

const STORES = ["database", "storage", "cache"];

/**
 * Real components grouped by domain, stores left to the flow views. Still over
 * the budget: the biggest domain collapses into one node, repeat. Measured on
 * the social model: every domain as one icon-less box scored 21, this 77.
 */
function overview(model: Model): DiagramSpec {
  const domainOf = new Map(model.components.map((c) => [c.id, c.domain]));
  const links = allLinks(model);
  const neighbours = (id: string) =>
    links.flatMap((l) => (l.from === id ? [l.to] : l.to === id ? [l.from] : []));
  // A domain of stores only shows its stores: hidden, it would vanish from the overview.
  const hasService = (domain: string) =>
    model.components.some((m) => m.domain === domain && !STORES.includes(m.category));
  const hidden = (c: Component) =>
    !!c.domain && STORES.includes(c.category) && hasService(c.domain);
  const core = model.components.filter((c) => !hidden(c));
  // Stand-in nodes for collapsed domains. Also tried merging shared clients and
  // externals into one node each: no score gain, so not done.
  const standIns = new Map<string, DiagramNode>();
  const bucketOf = new Map<string, string>();
  const count = () => core.filter((c) => !bucketOf.has(c.id)).length + standIns.size;
  const collapse = (id: string, node: Omit<DiagramNode, "id">, members: Component[]) => {
    standIns.set(id, { id, ...node });
    for (const m of members) bucketOf.set(m.id, id);
  };
  const inCore = (id: string) => core.filter((c) => c.domain === id);
  while (count() > MAX_DETAIL_NODES) {
    const biggest = model.domains
      .filter((d) => !standIns.has(d.id) && inCore(d.id).length > 1)
      .sort((a, b) => inCore(b.id).length - inCore(a.id).length)[0];
    if (!biggest) break;
    collapse(
      biggest.id,
      { label: biggest.label, sublabel: biggest.sublabel, category: "service" },
      inCore(biggest.id),
    );
  }
  // A hidden store something outside its domain reaches (blob storage the client
  // uploads to) comes back after collapse is settled, so it never pushes a service
  // out (OPE-110). Letting it count toward the budget swapped services for stores.
  const shown = model.components.filter(
    (c) => !hidden(c) || neighbours(c.id).some((n) => domainOf.get(n) !== c.domain),
  );
  // A store still hidden has no owner: its links stay inside its domain, so they go too.
  const owner = new Map<string, string>();
  for (const c of shown) owner.set(c.id, bucketOf.get(c.id) ?? c.id);
  const nodes = [
    ...shown.filter((c) => owner.get(c.id) === c.id).map(componentNode),
    ...standIns.values(),
  ];
  const merged = mergeLinks(links, (id) => owner.get(id));
  return {
    type: "system-design",
    title: `${model.title} - overview`,
    nodes,
    // One edge per node: 64.8 -> 83.4 mean overview score on the eval's models.
    // Also giving every node that sends traffic an outbound edge (a CDN kept only
    // its inbound one) cost 2.3 to 2.8 points, over or within budget, so not done.
    // 0.8 per node scores 87 but is a bare spanning tree, and it cut the social
    // overview's write path (the post service lost its publish to the bus).
    edges: pruneEdges(merged, nodes.length),
    groups: model.domains
      .filter((d) => !standIns.has(d.id))
      .map((d) => ({
        id: d.id,
        label: d.label,
        sublabel: d.sublabel,
        contains: shown.filter((c) => c.domain === d.id).map((c) => c.id),
      }))
      .filter((g) => g.contains.length > 1),
  };
}

/** Components in order of first appearance along the flow. */
function flowNodes(model: Model, flow: SystemFlow): DiagramNode[] {
  const byId = new Map(model.components.map((c) => [c.id, c]));
  const order: string[] = [];
  for (const s of flow.steps)
    for (const id of [s.from, s.to]) if (byId.has(id) && !order.includes(id)) order.push(id);
  return order.map((id) => componentNode(byId.get(id)!));
}

function flowView(model: Model, flow: SystemFlow): DiagramSpec {
  const nodes = flowNodes(model, flow);
  const ids = new Set(nodes.map((n) => n.id));
  const steps = flow.steps.map(({ reply: _, ...s }) => s);
  return {
    type: "system-design",
    title: flow.title,
    nodes,
    edges: edgesOf(mergeLinks(steps, (id) => (ids.has(id) ? id : undefined))),
  };
}

/** Steps become messages in order; a step's `reply` becomes the dashed answer right after it. */
function sequenceView(model: Model, flow: SystemFlow): DiagramSpec {
  const nodes = flowNodes(model, flow).map(({ icon: _, ...n }) => n);
  const ids = new Set(nodes.map((n) => n.id));
  const edges: DiagramEdge[] = [];
  for (const s of flow.steps) {
    if (!ids.has(s.from) || !ids.has(s.to)) continue;
    edges.push({
      id: `m${edges.length + 1}`,
      from: s.from,
      to: s.to,
      label: s.label,
      kind: s.kind ?? "sync",
    });
    if (s.reply && s.from !== s.to)
      edges.push({
        id: `m${edges.length + 1}`,
        from: s.to,
        to: s.from,
        label: s.reply,
        style: "dashed",
      });
  }
  return { type: "sequence", title: flow.title, nodes, edges };
}

/**
 * The diagrams a system model is drawn as. The split is decided here, by count,
 * not by the LLM: in the eval the model ignored "more than 12 -> split" about
 * half the time. Small systems get one detail view; big ones an overview plus
 * one view per flow. Sequence flows always get their own diagram.
 */
export function planViews(input: SystemModel): DiagramSpec[] {
  // Domain ids become group / stand-in node ids, and the model happily names a
  // domain "search" next to a component "search": each gets an id no component has.
  const taken = new Set(input.components.map((c) => c.id));
  const domainId = new Map<string, string>();
  for (const d of input.domains) {
    let id = `domain_${d.id}`;
    while (taken.has(id)) id += "_";
    taken.add(id);
    domainId.set(d.id, id);
  }
  const model: Model = {
    ...input,
    domains: input.domains.map((d) => ({ ...d, id: domainId.get(d.id)! })),
    components: input.components.map(({ domain, ...c }) => {
      const id = domainId.get(domain);
      return id ? { ...c, domain: id } : c;
    }),
  };
  // MAX_DETAIL_NODES is a target, not a cap: domains of one member cannot
  // collapse and flows follow the model's steps. In the eval 7 of 54 overviews
  // and 2 of ~100 flows ran over, most from models that predate required `domain`.
  // Measured negative result: switching views deeper than 5 to "TB" (against
  // ribbons) cost 7 points on overviews and 2 on flow views. Leave them LR.
  if (model.components.length <= MAX_DETAIL_NODES)
    return [
      detailView(model),
      ...model.flows.filter((f) => f.type === "sequence").map((f) => sequenceView(model, f)),
    ];
  return [
    overview(model),
    ...model.flows.map((f) =>
      f.type === "sequence" ? sequenceView(model, f) : flowView(model, f),
    ),
  ];
}
