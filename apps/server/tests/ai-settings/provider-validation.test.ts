/** Verifies credential probes bound reasoning models without making paid provider requests. */
import { describe, expect, test } from "bun:test";
import { validationOptionsFor } from "../../src/routes/ai-settings/validation";

describe("provider credential validation options", () => {
  test("uses minimal reasoning and enough output budget for OpenRouter GPT-5", () => {
    expect(validationOptionsFor("openrouter", "openai/gpt-5")).toEqual({
      maxOutputTokens: 128,
      providerOptions: {
        openrouter: { reasoning: { effort: "minimal", exclude: true } },
      },
    });
  });

  test("does not impose GPT-5 reasoning settings on other OpenRouter models", () => {
    expect(validationOptionsFor("openrouter", "anthropic/claude-sonnet-5")).toEqual({
      maxOutputTokens: 64,
      providerOptions: undefined,
    });
  });
});
