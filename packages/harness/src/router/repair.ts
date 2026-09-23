import type { Point } from "./types.js";
import type { Terminal } from "./search.js";
import { routingCost } from "./quality.js";

/**
 * Port-order repair. Ordering heuristics cannot see every nesting, so for each
 * face we try swapping neighbouring ports, reroute just those two edges, and
 * keep the swap only if the whole routing gets cheaper (fewer crossings first).
 * `reroute` routes one edge on the given ports against every other route.
 */
export function swapRepair(
  routes: Map<string, Point[]>,
  ports: Map<string, [Terminal, Terminal]>,
  reroute: (
    edge: string,
    ports: [Terminal, Terminal],
    routes: Map<string, Point[]>,
  ) => Point[] | undefined,
): void {
  const faces = new Map<string, { edge: string; end: 0 | 1 }[]>();
  for (const [edge, pair] of ports) {
    pair.forEach((t, end) => {
      const k = `${t.box.x},${t.box.y}:${t.face}`;
      faces.set(k, [...(faces.get(k) ?? []), { edge, end: end as 0 | 1 }]);
    });
  }
  let cost = routingCost(routes);
  for (let pass = 0; pass < 2; pass++) {
    let improved = false;
    for (const slots of faces.values()) {
      if (slots.length < 2) continue;
      const along = (s: { edge: string; end: 0 | 1 }) => {
        const t = ports.get(s.edge)![s.end];
        return t.face === "left" || t.face === "right" ? t.port.y : t.port.x;
      };
      slots.sort((a, b) => along(a) - along(b));
      for (let i = 0; i < slots.length - 1; i++) {
        const [p, q] = [slots[i]!, slots[i + 1]!];
        if (p.edge === q.edge || along(p) === along(q)) continue;
        const swapped = swap(ports, p, q);
        const trial = new Map(routes);
        const rp = reroute(p.edge, swapped.get(p.edge)!, trial);
        if (rp) trial.set(p.edge, rp);
        const rq = rp && reroute(q.edge, swapped.get(q.edge)!, trial);
        if (!rp || !rq) continue;
        trial.set(q.edge, rq);
        // p was routed against q's OLD path, so each is routed once more against
        // the other's new one; else a swap that only works when both routes
        // change is never seen. Measured: +6 classic, 1 fewer crossing.
        const again = reroute(p.edge, swapped.get(p.edge)!, trial);
        if (again) trial.set(p.edge, again);
        const againQ = again && reroute(q.edge, swapped.get(q.edge)!, trial);
        if (againQ) trial.set(q.edge, againQ);
        const c = routingCost(trial);
        if (c < cost) {
          cost = c;
          for (const [k, v] of trial) routes.set(k, v);
          for (const [k, v] of swapped) ports.set(k, v);
          [slots[i], slots[i + 1]] = [q, p];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
}

function swap(
  ports: Map<string, [Terminal, Terminal]>,
  p: { edge: string; end: 0 | 1 },
  q: { edge: string; end: 0 | 1 },
): Map<string, [Terminal, Terminal]> {
  const tp = ports.get(p.edge)![p.end];
  const tq = ports.get(q.edge)![q.end];
  const out = new Map<string, [Terminal, Terminal]>();
  const set = (s: { edge: string; end: 0 | 1 }, port: Point) => {
    const pair = [...(out.get(s.edge) ?? ports.get(s.edge)!)] as [Terminal, Terminal];
    pair[s.end] = { ...pair[s.end], port };
    out.set(s.edge, pair);
  };
  set(p, tq.port);
  set(q, tp.port);
  return out;
}
