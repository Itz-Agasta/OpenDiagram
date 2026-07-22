/** Locks down BYOK mutation contracts that protect validation and default-provider invariants. */
import { describe, expect, test } from "bun:test";
import {
  createProviderSchema,
  listModelsSchema,
  updateProviderSchema,
  validateProviderSchema,
} from "../../src/routes/ai-settings/schemas";

describe("BYOK settings schemas", () => {
  test("does not allow callers to bypass provider validation", () => {
    const result = createProviderSchema.safeParse({
      provider: "openrouter",
      apiKey: "sk-test-key",
      validate: false,
    });
    expect(result.success).toBe(false);
  });

  test("accepts OpenRouter for new BYOK connections", () => {
    expect(
      createProviderSchema.safeParse({ provider: "openrouter", apiKey: "sk-or-test-key" }).success,
    ).toBe(true);
  });

  test("rejects providers that are not currently enabled", () => {
    const input = { provider: "openai", apiKey: "sk-test-key" };
    expect(createProviderSchema.safeParse(input).success).toBe(false);
    expect(validateProviderSchema.safeParse(input).success).toBe(false);
    expect(listModelsSchema.safeParse(input).success).toBe(false);
  });

  test("only permits promoting a provider, never clearing the default directly", () => {
    expect(updateProviderSchema.safeParse({ isDefault: true }).success).toBe(true);
    expect(updateProviderSchema.safeParse({ isDefault: false }).success).toBe(false);
  });

  test("rejects empty provider updates", () => {
    expect(updateProviderSchema.safeParse({}).success).toBe(false);
  });
});
