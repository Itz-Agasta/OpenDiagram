/** Enforces the deployment policy for user-supplied OpenAI-compatible endpoints. */
import { env } from "@OpenDiagram/env/server";
import { lookup } from "node:dns/promises";
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
  const addresses = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    throw new Error("Base URL must resolve to a public address.");
  }

  return url;
}

function isNonPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
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

  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:0.") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:169.254.") ||
    normalized.startsWith("::ffff:172.16.") ||
    normalized.startsWith("::ffff:172.17.") ||
    normalized.startsWith("::ffff:172.18.") ||
    normalized.startsWith("::ffff:172.19.") ||
    normalized.startsWith("::ffff:172.2") ||
    normalized.startsWith("::ffff:172.3") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}
