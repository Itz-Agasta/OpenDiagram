import type { NextRequest } from "next/server";

const UPSTREAM = "https://cloud.umami.is";

// The tracker fetches exactly these two, both derived from its own script src.
// Anything else 404s instead of being relayed.
const ALLOWED: Record<string, "GET" | "POST"> = {
  "script.js": "GET",
  "api/send": "POST",
};

// Everything Umami needs to attribute a hit. Notably absent: `cookie` and
// `authorization`. A next.config rewrite would have been three lines, but its
// http-proxy forwards request headers verbatim, and the tracker's POST is
// same-origin, so the browser attaches our better-auth session cookie and the
// rewrite hands it to a third party on every pageview of a logged-in user.
// Verified against Next 16: `cookie` and `authorization` both arrive upstream.
const FORWARD = ["content-type", "user-agent", "accept-language", "x-forwarded-for"];

async function proxy(req: NextRequest, segments: string[]) {
  const path = segments.join("/");
  if (ALLOWED[path] !== req.method) {
    return new Response(null, { status: 404 });
  }

  const headers = new Headers();
  for (const name of FORWARD) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(`${UPSTREAM}/${path}`, {
    method: req.method,
    headers,
    body: req.method === "POST" ? await req.text() : undefined,
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
 * blocklists match on the `cloud.umami.is` hostname and the snippet Umami
 * hands you loses every uBlock/Brave visitor.
 *
 * https://umami.is/docs/bypass-ad-blockers
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}
