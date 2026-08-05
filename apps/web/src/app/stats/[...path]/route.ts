import type { NextRequest } from "next/server";

// Two upstreams, not one. The Cloud build of the tracker serves from
// cloud.umami.is but hardcodes gateway.umami.is as its collector, so beacons go
// where an unproxied browser would have sent them. Anything not listed here
// 404s rather than being relayed: a wildcard would let any client bounce
// arbitrary requests off our domain into Umami's API.
const ROUTES: Record<string, { method: "GET" | "POST"; upstream: string }> = {
  "script.js": { method: "GET", upstream: "https://cloud.umami.is/script.js" },
  "api/send": { method: "POST", upstream: "https://gateway.umami.is/api/send" },
};

// Everything Umami needs to attribute a hit. Notably absent: `cookie` and
// `authorization`. A next.config rewrite would have been three lines, but its
// http-proxy forwards request headers verbatim (verified against Next 16: both
// arrive upstream), which hands a live better-auth session cookie to a third
// party every time a logged-in browser fetches the tracker.
const FORWARD = ["content-type", "user-agent", "accept-language", "x-forwarded-for"];

async function proxy(req: NextRequest, segments: string[]) {
  const route = ROUTES[segments.join("/")];
  if (route?.method !== req.method) {
    return new Response(null, { status: 404 });
  }

  const headers = new Headers();
  for (const name of FORWARD) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Bounded so an upstream that hangs costs us one timeout rather than a full
  // function duration per beacon. A failure here throws and Next answers 500,
  // which is the honest outcome: analytics is degraded, the page is not.
  const upstream = await fetch(route.upstream, {
    method: req.method,
    headers,
    body: req.method === "POST" ? await req.text() : undefined,
    signal: AbortSignal.timeout(5_000),
  });

  const response = new Headers();
  for (const name of ["content-type", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) response.set(name, value);
  }

  return new Response(upstream.body, { status: upstream.status, headers: response });
}

/**
 * Serves the Umami tracker and its collector from our own origin, because
 * blocklists match on the `cloud.umami.is` and `gateway.umami.is` hostnames and
 * the snippet Umami hands you loses every uBlock/Brave visitor. Pairs with
 * `data-host-url="/stats"` in the root layout, without which the tracker skips
 * this route and beacons the blocked host directly.
 *
 * https://umami.is/docs/bypass-ad-blockers
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}
