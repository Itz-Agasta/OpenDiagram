"use client";

import { useEffect, useState } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

function LenisScrollTriggerSync() {
  const lenis = useLenis();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!lenis) return;

    lenis.on("scroll", ScrollTrigger.update);
    return () => lenis.off("scroll", ScrollTrigger.update);
  }, [lenis]);

  return null;
}

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (prefersReducedMotion !== false) return <>{children}</>;

  return (
    <ReactLenis root>
      <LenisScrollTriggerSync />
      {children}
    </ReactLenis>
  );
}
