"use client";

import { useEffect, useRef } from "react";

/**
 * Drifting rainbow backdrop for the centred auth layout. The pointer only writes
 * `--mx`/`--my`; the glow, parallax and easing (a transition on the registered
 * properties) all live in auth-visual.css, so there is no frame loop here.
 * https://codefronts.com/motion/css-background-animations/cursor-spotlight-follow-effect/
 */
export function AuroraBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      el.style.setProperty("--mx", `${((e.clientX / window.innerWidth) * 100).toFixed(2)}%`);
      el.style.setProperty("--my", `${((e.clientY / window.innerHeight) * 100).toFixed(2)}%`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div ref={ref} className="aurora" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
