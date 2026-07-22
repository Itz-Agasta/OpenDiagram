/** Defines deterministic runtime behavior for each persisted AI source preference. */
import type { PreferredAiSource } from "@OpenDiagram/db/schema/user-ai-provider";

export const DEFAULT_PREFERRED_SOURCE: PreferredAiSource = "platform";

export function sourceOrderForPreference(preferred: PreferredAiSource): Array<"byok" | "platform"> {
  if (preferred === "platform") return ["platform"];
  if (preferred === "byok") return ["byok"];
  return ["byok", "platform"];
}
