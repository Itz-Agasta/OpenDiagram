/**
 * DEV-only page load + client route timing.
 */

import { log } from "./logger";

type RouterLike = {
  subscribe: (
    eventType: "onBeforeNavigate" | "onResolved",
    fn: (event: {
      toLocation?: { pathname?: string; href?: string };
      pathChanged?: boolean;
    }) => void,
  ) => () => void;
};

/**
 * Logs Navigation Timing once after the window load event.
 */
export function trackPageLoads(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;

  const emit = () => {
    const entries = performance.getEntriesByType("navigation");
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return;

    log.info({
      type: "page_load",
      path: window.location.pathname,
      ttfbMs: Math.round(nav.responseStart - nav.requestStart),
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      loadMs: Math.round(nav.loadEventEnd - nav.startTime),
      transferSize: nav.transferSize,
    });
  };

  if (document.readyState === "complete") {
    // Defer so navigation timing is fully populated.
    queueMicrotask(emit);
  } else {
    window.addEventListener(
      "load",
      () => {
        queueMicrotask(emit);
      },
      { once: true },
    );
  }
}

/**
 * Logs client-side route transition duration (before navigate → resolved).
 */
export function trackRouter(router: RouterLike): () => void {
  if (!import.meta.env.DEV) {
    return () => {};
  }

  let navStart = performance.now();
  let lastPath = typeof window !== "undefined" ? window.location.pathname : "";

  const unsubBefore = router.subscribe("onBeforeNavigate", () => {
    navStart = performance.now();
  });

  const unsubResolved = router.subscribe("onResolved", (event) => {
    const path =
      event.toLocation?.pathname ??
      (typeof window !== "undefined" ? window.location.pathname : lastPath);
    const durationMs = Math.round(performance.now() - navStart);
    lastPath = path;

    log.info({
      type: "route",
      path,
      durationMs,
      pathChanged: event.pathChanged ?? true,
    });
  });

  return () => {
    unsubBefore();
    unsubResolved();
  };
}
