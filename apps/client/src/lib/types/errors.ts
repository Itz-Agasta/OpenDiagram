export interface CreationQuota {
  actorType: "guest" | "user";
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
  signupCredits?: number;
}

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

export class UpstreamRateLimitError extends Error {
  constructor(message = "The AI provider is temporarily rate-limited. Please try again shortly.") {
    super(message);
    this.name = "UpstreamRateLimitError";
  }
}
