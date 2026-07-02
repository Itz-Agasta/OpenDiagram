import registryJson from "./registry.json";

export interface IconEntry {
  id: string;
  name: string;
  category: string;
  tags: string[];
  keywords: string[];
  source_lib: string;
  elements: Record<string, unknown>[];
}

export type IconRegistry = Record<string, IconEntry>;

/** The tagged icon registry built offline by scripts/icon-fetcher. */
export const iconRegistry = registryJson as unknown as IconRegistry;

/**
 * Compact icon catalog for LLM system-prompt injection.
 *
 * One line per icon — `id: tag, tag, ...` — grouped under a category header.
 * The model picks `node.icon` keys from this list, so the ids here are exactly
 * what the renderer later looks up. Tags (not full element JSON) are all the
 * model needs to choose, which keeps the prompt small.
 */
export function buildIconCatalog(): string {
  const byCategory = new Map<string, string[]>();

  for (const icon of Object.values(iconRegistry)) {
    if (icon.tags.length === 0) continue; // untagged icons are invisible to the AI
    const cat = icon.category || "other";
    const lines = byCategory.get(cat) ?? [];
    lines.push(`${icon.id}: ${icon.tags.join(", ")}`);
    byCategory.set(cat, lines);
  }

  return [...byCategory.entries()]
    .map(([cat, lines]) => `## ${cat}\n${lines.sort().join("\n")}`)
    .join("\n\n");
}
