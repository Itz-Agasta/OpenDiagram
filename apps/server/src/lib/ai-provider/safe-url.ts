/** Enforces the deployment policy for user-supplied OpenAI-compatible endpoints. */
import { env } from "@OpenDiagram/env/server";

/** Validate custom OpenAI-compatible endpoints used by self-hosted deployments. */
export function assertSafeBaseUrl(raw: string): URL {
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

  return url;
}
