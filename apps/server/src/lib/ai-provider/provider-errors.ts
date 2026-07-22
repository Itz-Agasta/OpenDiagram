/** Defines stable resolver errors returned to API call sites and clients. */
export class AiProviderRequiredError extends Error {
  code = "ai_provider_required" as const;

  constructor(message = "Configure an AI provider in Settings.") {
    super(message);
    this.name = "AiProviderRequiredError";
  }
}

export class AiProviderInvalidError extends Error {
  code = "ai_provider_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "AiProviderInvalidError";
  }
}
