/** Enforces the deployment policy for user-supplied OpenAI-compatible endpoints. */
import { env } from "@OpenDiagram/env/server";
import { isIP } from "node:net";

/** Validate custom OpenAI-compatible endpoints used by self-hosted deployments. */
export async function assertSafeBaseUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid base URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must use http or https.");
  }

  if (env.NODE_ENV === "production" && env.AI_PLATFORM_ENABLED) {
    throw new Error(
      "Custom OpenAI-compatible URLs are disabled on the hosted platform. Use OpenAI, Anthropic, Google, or OpenRouter.",
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(hostname) !== 4 && isIP(hostname) !== 6) {
    throw new Error("Base URL must use a public IP address to prevent DNS rebinding.");
  }
  if (isNonPublicAddress(hostname)) {
    throw new Error("Base URL must resolve to a public address.");
  }

  return url;
}

function isNonPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return isNonPublicIpv4(address.split(".").map(Number));
  }

  const normalized = address.toLowerCase();
  const mappedIpv4 = parseMappedIpv4(normalized);
  if (mappedIpv4) return isNonPublicIpv4(mappedIpv4);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:")
  );
}

function isNonPublicIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && b === 18) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a! >= 224
  );
}

function parseMappedIpv4(address: string): number[] | null {
  if (!address.startsWith("::ffff:")) return null;
  const groups = address
    .split(":")
    .slice(-2)
    .map((group) => Number.parseInt(group, 16));
  if (groups.length !== 2 || groups.some((group) => Number.isNaN(group))) return null;
  return [groups[0]! >>> 8, groups[0]! & 255, groups[1]! >>> 8, groups[1]! & 255];
}
