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

const catalogCache = new Map<string, string>();

/**
 * Compact icon catalog for LLM system-prompt injection.
 *
 * One line per icon — `id: tag, tag, ...` — grouped under a category header.
 * The model picks `node.icon` keys from this list, so the ids here are exactly
 * what the renderer later looks up. Tags (not full element JSON) are all the
 * model needs to choose, which keeps the prompt small.
 */
export function buildIconCatalog(categories?: string[] | readonly string[]): string {
  const cacheKey = categories ? [...categories].sort().join(",") : "all";
  if (catalogCache.has(cacheKey)) {
    return catalogCache.get(cacheKey)!;
  }

  const byCategory = new Map<string, string[]>();
  const filterSet = categories ? new Set(categories) : null;

  for (const icon of Object.values(iconRegistry)) {
    if (icon.tags.length === 0) continue; // untagged icons are invisible to the AI
    const cat = icon.category || "other";
    if (filterSet && !filterSet.has(cat)) continue;

    const lines = byCategory.get(cat) ?? [];
    lines.push(`${icon.id}: ${icon.tags.join(", ")}`);
    byCategory.set(cat, lines);
  }

  const result = [...byCategory.entries()]
    .map(([cat, lines]) => `## ${cat}\n${lines.sort().join("\n")}`)
    .join("\n\n");

  catalogCache.set(cacheKey, result);
  return result;
}
