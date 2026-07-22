/** Defines which persisted provider kinds are currently available for new BYOK connections. */
import type { UserAiProviderKind } from "@OpenDiagram/db/schema/user-ai-provider";

export type EnabledByokProvider = {
  id: UserAiProviderKind;
  label: string;
  defaultModel: string;
  keyPlaceholder: string;
  description: string;
};

export const enabledByokProviders = [
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openrouter/free",
    keyPlaceholder: "sk-or-…",
    description: "Uses OpenRouter at https://openrouter.ai/api/v1.",
  },
] as const satisfies readonly EnabledByokProvider[];

export const enabledByokProviderKinds = enabledByokProviders.map((provider) => provider.id) as [
  UserAiProviderKind,
  ...UserAiProviderKind[],
];

export function isEnabledByokProvider(
  provider: UserAiProviderKind,
): provider is (typeof enabledByokProviders)[number]["id"] {
  return enabledByokProviderKinds.includes(provider);
}
