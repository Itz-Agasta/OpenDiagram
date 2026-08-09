import { createAuthClient } from "better-auth/react";
import { getDevFetch } from "../dev-telemetry";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL,
  // DEV-only timing via customFetchImpl; production uses plain fetch.
  fetchOptions: {
    customFetchImpl: getDevFetch(),
  },
});

const DEFAULT_FRONTEND_PATH = "/App";
const FRONTEND_PATH_BASE = "https://frontend.opendiagram.invalid";

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

/**
 * Returns a normalized, same-origin relative frontend path.
 */
export function safeFrontendPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || hasControlCharacter(path)) {
    return DEFAULT_FRONTEND_PATH;
  }

  try {
    const url = new URL(path, FRONTEND_PATH_BASE);
    if (url.origin !== FRONTEND_PATH_BASE) return DEFAULT_FRONTEND_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_FRONTEND_PATH;
  }
}

/**
 * Builds an absolute URL on the frontend origin for OAuth redirects.
 * Relative callbacks otherwise resolve against the Better Auth API host.
 */
export function frontendCallbackURL(path = DEFAULT_FRONTEND_PATH): string {
  const safePath = safeFrontendPath(path);
  if (typeof window === "undefined") return safePath;
  return new URL(safePath, window.location.origin).toString();
}
