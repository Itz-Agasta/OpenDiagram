import { env } from "@OpenDiagram/env/web";
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (sessionCookie) {
    const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/auth/get-session`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    }).catch(() => null);
    const session = response?.ok ? ((await response.json()) as { user?: unknown } | null) : null;

    if (session?.user) return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/settings/:path*"],
};
