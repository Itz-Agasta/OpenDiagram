import type { RenderSkeleton } from "../src/index.js";

/** Guards against NaN/Infinity leaking into coordinates, the failure mode that renders nothing. */
export function allFinite(skeletons: RenderSkeleton[]): boolean {
  return skeletons.every((s) => {
    const nums = Object.values(s).filter((v): v is number => typeof v === "number");
    const pts = s.kind === "arrow" ? s.points.flat() : [];
    return [...nums, ...pts].every((n) => Number.isFinite(n));
  });
}
