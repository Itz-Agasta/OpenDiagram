import type { DiagramEdge, DiagramSpec } from "../schema.js";

export interface Sanitized {
  nodeParent: Map<string, string>; // node id -> group/zone id
  groups: { id: string; contains: string[] }[];
  zones: { id: string; contains: string[] }[]; // group ids + direct node ids
  edges: (DiagramEdge & { id: string })[];
  warnings: string[];
}

/**
 * LLM output can reference ids that don't exist (hallucinated endpoints, a node
 * claimed by two groups, a group inside two zones) — sanitized defensively so
 * bad output degrades gracefully instead of throwing. Notes land in `warnings`;
 * this package has no logger dependency, callers decide how to surface them.
 */
export function sanitize(spec: DiagramSpec): Sanitized {
  const warnings: string[] = [];
  const nodeIds = new Set(spec.nodes.map((n) => n.id));
  const nodeParent = new Map<string, string>();

  const groups: Sanitized["groups"] = [];
  for (const group of spec.groups ?? []) {
    if (nodeIds.has(group.id)) {
      warnings.push(`dropping group "${group.id}" — id collides with a node id`);
      continue;
    }
    const contains = [...new Set(group.contains)].filter(
      (id) => nodeIds.has(id) && !nodeParent.has(id),
    );
    if (contains.length === 0) {
      warnings.push(`dropping group "${group.id}" — no valid unclaimed nodes`);
      continue;
    }
    for (const id of contains) nodeParent.set(id, group.id);
    groups.push({ id: group.id, contains });
  }

  const groupIds = new Set(groups.map((g) => g.id));
  const claimedGroups = new Set<string>();
  const zones: Sanitized["zones"] = [];
  for (const zone of spec.zones ?? []) {
    if (nodeIds.has(zone.id) || groupIds.has(zone.id)) {
      warnings.push(`dropping zone "${zone.id}" — id collides with a node/group id`);
      continue;
    }
    const contains: string[] = [];
    for (const id of zone.contains) {
      if (groupIds.has(id) && !claimedGroups.has(id)) {
        claimedGroups.add(id);
        contains.push(id);
      } else if (nodeIds.has(id) && !nodeParent.has(id)) {
        nodeParent.set(id, zone.id);
        contains.push(id);
      }
    }
    if (contains.length === 0) {
      warnings.push(`dropping zone "${zone.id}" — no valid members`);
      continue;
    }
    zones.push({ id: zone.id, contains });
  }

  const edges: Sanitized["edges"] = [];
  const usedEdgeIds = new Set<string>();
  // Reciprocal request/response pairs (A->B + B->A) merge into ONE
  // bidirectional edge: layered layout routes every backward edge all the way
  // around the graph, so pairs render as giant unreadable loops otherwise.
  const byEndpoints = new Map<string, DiagramEdge & { id: string }>();
  spec.edges.forEach((edge, i) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      warnings.push(`dropping edge with unknown endpoint (${edge.from} -> ${edge.to})`);
      return;
    }
    // JSON key — plain `${from}->${to}` could collide when ids contain "->".
    const reverse =
      edge.from !== edge.to ? byEndpoints.get(JSON.stringify([edge.to, edge.from])) : undefined;
    if (reverse) {
      reverse.direction = "bi";
      reverse.label = [reverse.label, edge.label].filter(Boolean).join(" / ") || undefined;
      reverse.protocol = [reverse.protocol, edge.protocol].filter(Boolean).join(" / ") || undefined;
      warnings.push(`merged reciprocal edges ${edge.to}<->${edge.from} into one bidirectional`);
      return;
    }
    // Duplicate ids would collapse onto one edgeRoutes entry, losing an edge.
    let id = edge.id ?? `edge-${i}`;
    while (usedEdgeIds.has(id)) id = `${id}-${i}`;
    usedEdgeIds.add(id);
    const kept = { ...edge, id };
    byEndpoints.set(JSON.stringify([edge.from, edge.to]), kept);
    edges.push(kept);
  });

  return { nodeParent, groups, zones, edges, warnings };
}
