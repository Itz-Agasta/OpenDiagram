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
 * Which pack wins when two icons share a slug, most preferred first.
 *
 * The overlaps are the same logical service drawn twice (`aws-architecture-icons`
 * and `aws-serverless-icons-v2` both ship dynamodb, lambda, s3...), so the model
 * gains nothing from seeing both and pays for the duplicate line. Generic packs
 * outrank AWS ones: a plain `vpc` or `server` should not resolve to AWS artwork.
 */
const PACK_PRECEDENCE = [
  "architecture-diagram-components",
  "software-logos",
  "aws-architecture-icons",
  "aws-serverless-icons-v2",
];

function packRank(icon: IconEntry): number {
  const index = PACK_PRECEDENCE.indexOf(icon.source_lib);
  return index === -1 ? PACK_PRECEDENCE.length : index;
}

/**
 * The catalog key for an icon, taken from `name` rather than `id`.
 *
 * `id` embeds the pack it came from, so 249 lines opened with the literal string
 * `aws-architecture-icons__` -- about 1.9k tokens per request spent on a prefix
 * that carries no meaning. Worse, the v1 packs have no per-item names upstream,
 * so their ids are positional (`software-logos__software-logos-12`) and told the
 * model nothing; `name` was curated by hand and says "Postgres".
 */
function catalogSlug(icon: IconEntry): string {
  return canonical(icon.name);
}

/** The lookup form for everything that is not a registry id: slugs, keywords, model output. */
function canonical(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Best icon per lookup name, over the WHOLE registry regardless of category filters. */
type Indexes = { slugs: Map<string, string>; keywords: Map<string, string> };
let indexes: Indexes | null = null;

function bestByName(pick: (icon: IconEntry) => string[]): Map<string, string> {
  const winners = new Map<string, IconEntry>();
  for (const icon of Object.values(iconRegistry)) {
    if (icon.tags.length === 0) continue;
    for (const name of pick(icon)) {
      const held = winners.get(name);
      if (!held || packRank(icon) < packRank(held)) winners.set(name, icon);
    }
  }
  return new Map([...winners].map(([name, icon]) => [name, icon.id]));
}

function getIndexes(): Indexes {
  if (indexes) return indexes;
  indexes = {
    slugs: bestByName((icon) => [catalogSlug(icon)]),
    keywords: bestByName((icon) => icon.keywords.map(canonical)),
  };
  return indexes;
}

/**
 * Resolve whatever landed in `node.icon` to a registry id, or undefined.
 *
 * Registry id first: specs saved before the catalog moved to slugs hold those and
 * live in the production database. Then the canonical form, since the model does
 * not always echo the key back exactly as shown. Keywords last, and only because
 * the eval caught it answering `kafka` for `managed-streaming-for-apache-kafka`.
 * Every tier is an exact lookup; an unknown key stays unknown and warns.
 */
function resolveIconKey(key: string): string | undefined {
  if (iconRegistry[key]) return key;
  const { slugs, keywords } = getIndexes();
  const lookup = canonical(key);
  return slugs.get(lookup) ?? keywords.get(lookup);
}

/** A node as far as icon handling cares. Structural, to keep this file off the harness types. */
type IconBearingNode = { icon?: string | undefined };

/**
 * Rewrite every `node.icon` to a registry id, dropping the ones that miss.
 *
 * MUST run before layout: `measure.ts#nodeSize` reserves the icon's box by
 * registry lookup and the renderer draws by the same key, so a node still holding
 * a catalog slug would be measured for an icon and drawn without one. Dropping
 * unknowns here keeps the two agreeing. Returns what it could not place, for the
 * caller to warn about.
 */
export function normalizeSpecIcons<T extends { nodes: IconBearingNode[] }>(
  spec: T,
): { spec: T; unknownIcons: string[] } {
  const unknownIcons = new Set<string>();
  const nodes = spec.nodes.map((node) => {
    if (!node.icon) return node;
    const resolved = resolveIconKey(node.icon);
    if (!resolved) {
      unknownIcons.add(node.icon);
      return { ...node, icon: undefined };
    }
    return resolved === node.icon ? node : { ...node, icon: resolved };
  });
  return { spec: { ...spec, nodes }, unknownIcons: [...unknownIcons] };
}

/**
 * Compact icon catalog for LLM system-prompt injection.
 *
 * One line per icon — `slug: tag, tag, ...` — grouped under a category header.
 * The model picks `node.icon` from these slugs; `resolveIconKey` maps them back
 * to registry ids. Tags (not full element JSON) are all the model needs to
 * choose, which keeps the prompt small.
 *
 * Tags that only restate the slug are dropped, as is a blanket `aws` tag that sat
 * on 249 of 302 entries. Both were paid for once per icon per request and told
 * the model nothing it could not read off the slug.
 */
export function buildIconCatalog(categories?: string[] | readonly string[]): string {
  const cacheKey = categories ? [...categories].sort().join(",") : "all";
  const cached = catalogCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const filterSet = categories ? new Set(categories) : null;
  const byCategory = new Map<string, string[]>();

  for (const [slug, id] of getIndexes().slugs) {
    const icon = iconRegistry[id]!;
    const cat = icon.category || "other";
    if (filterSet && !filterSet.has(cat)) continue;

    const slugWords = new Set(slug.split("-"));
    const tags = icon.tags.filter(
      (tag) => tag !== "aws" && !tag.split("-").every((word) => slugWords.has(word)),
    );

    const lines = byCategory.get(cat) ?? [];
    lines.push(tags.length > 0 ? `${slug}: ${tags.join(", ")}` : slug);
    byCategory.set(cat, lines);
  }

  const result = [...byCategory.entries()]
    .map(([cat, lines]) => `## ${cat}\n${lines.sort().join("\n")}`)
    .join("\n\n");

  catalogCache.set(cacheKey, result);
  return result;
}
