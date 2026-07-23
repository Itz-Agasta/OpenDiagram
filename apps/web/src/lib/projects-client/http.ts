import type { CreationQuota } from "./types";

export class CreationQuotaError extends Error {
  quota?: CreationQuota;

  constructor(message: string, quota?: CreationQuota) {
    super(message);
    this.name = "CreationQuotaError";
    this.quota = quota;
  }
}

export class AiProviderCreditError extends Error {
  code = "byok_credit_exhausted" as const;

  constructor(message: string) {
    super(message);
    this.name = "AiProviderCreditError";
  }
}

export function projectResponseError(data: unknown, fallback: string): Error {
  const payload = data as
    | { error?: string; code?: string; quota?: CreationQuota }
    | null
    | undefined;
  const message = payload?.error ?? fallback;

  if (payload?.code === "creation_quota_exceeded") {
    return new CreationQuotaError(message, payload.quota);
  }
  if (payload?.code === "byok_credit_exhausted") return new AiProviderCreditError(message);
  return new Error(message);
}

export async function readProjectResponse(response: Response) {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) return response.json();

  const text = await response.text();
  return text ? { error: text } : {};
}
