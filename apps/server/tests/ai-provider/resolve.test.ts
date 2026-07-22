/** Verifies preference semantics independently from provider credentials and the database. */
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PREFERRED_SOURCE,
  sourceOrderForPreference,
} from "../../src/lib/ai-provider/preferences";

describe("AI source preference", () => {
  test("defaults to platform without silently spending a BYOK key", () => {
    expect(DEFAULT_PREFERRED_SOURCE).toBe("platform");
    expect(sourceOrderForPreference(DEFAULT_PREFERRED_SOURCE)).toEqual(["platform"]);
  });

  test("keeps explicit BYOK and automatic fallback semantics distinct", () => {
    expect(sourceOrderForPreference("byok")).toEqual(["byok"]);
    expect(sourceOrderForPreference("auto")).toEqual(["byok", "platform"]);
  });
});
