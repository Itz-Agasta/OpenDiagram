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

// Deliberately drops cookie and authorization. A next.config rewrite would
// work, but its proxy forwards all headers (verified against Next 16), which
// leaks a live better-auth session to Umami on every beacon.
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

  // Timeout so a hanging upstream costs one abort, not the full function
  // duration. 500 on failure is fine: analytics degraded, page fine.
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

// Serves Umami's script + collector from our origin so ad blockers that
// block cloud/gateway.umami.is don't kill tracking. Pairs with
// data-host-url="/stats" in the root layout.
// https://umami.is/docs/bypass-ad-blockers
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}
