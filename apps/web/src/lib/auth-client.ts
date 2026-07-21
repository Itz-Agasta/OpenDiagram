"use client";

import { createAuthClient } from "better-auth/react";

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL;
if (!baseURL) {
  throw new Error(
    "NEXT_PUBLIC_SERVER_URL is required. This env var must be set at build time for auth requests to reach the server.",
  );
}

export const authClient = createAuthClient({ baseURL });

/**
 * Builds an absolute URL on the frontend origin for OAuth redirects.
 * Relative callbacks otherwise resolve against the Better Auth API host.
 */
export function frontendCallbackURL(path = "/dashboard"): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
