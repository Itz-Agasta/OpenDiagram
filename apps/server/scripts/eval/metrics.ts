import type { EvalPrompt } from "./prompts";

type Spec = {
  nodes?: { label?: string; sublabel?: string }[];
  edges?: { label?: string }[];
  groups?: { label?: string }[];
  zones?: { label?: string }[];
};

/** A sublabel naming several things ("Cart, Order, Inventory") merged them into one box. */
const isList = (s: string) => /[,;]/.test(s);

/**
 * Text a reader can actually see as a concept. For coverage a listed sublabel
 * contributes only its first item: counting the whole list is what let a 12-node
 * merge of a 30-part system score 0.80. `fullSublabels` keeps the whole list,
 * which is what `leaks` needs, since everything drawn can leak.
 */
function visibleText(specs: Spec[], fullSublabels = false): string {
  const parts: string[] = [];
  for (const spec of specs) {
    for (const n of spec.nodes ?? []) {
      parts.push(n.label ?? "");
      if (n.sublabel)
        parts.push(
          isList(n.sublabel) && !fullSublabels ? n.sublabel.split(/[,;]/)[0]! : n.sublabel,
        );
    }
    for (const e of spec.edges ?? []) parts.push(e.label ?? "");
    for (const g of [...(spec.groups ?? []), ...(spec.zones ?? [])]) parts.push(g.label ?? "");
  }
  return parts.join("\n").toLowerCase();
}

// Word-start match, so "eta" does not score inside "metadata"; stems like "retriev" still work.
const hit = (text: string, term: string) =>
  term.split("|").some((alt) => new RegExp(`\\b${alt}`, "i").test(text));

export function coverage(prompt: EvalPrompt, specs: Spec[]): number | null {
  if (!prompt.expect.length) return null;
  if (!specs.length) return 0;
  const text = visibleText(specs);
  return prompt.expect.filter((k) => hit(text, k)).length / prompt.expect.length;
}

/** The old whole-JSON match, kept only to compare against earlier runs. */
export function looseCoverage(prompt: EvalPrompt, specs: Spec[]): number | null {
  if (!prompt.expect.length) return null;
  if (!specs.length) return 0;
  const text = JSON.stringify(specs).toLowerCase();
  return prompt.expect.filter((k) => hit(text, k)).length / prompt.expect.length;
}

export function leaks(prompt: EvalPrompt, specs: Spec[]): string[] {
  // Everything drawn counts for a leak, including the tail of a listed sublabel.
  const text = visibleText(specs, true);
  return (prompt.forbid ?? []).filter((k) => hit(text, k));
}

export function stuffed(specs: Spec[]): number {
  return specs.flatMap((s) => s.nodes ?? []).filter((n) => n.sublabel && isList(n.sublabel)).length;
}

export const sentences = (text: string) => (text.match(/[.!?](\s|$)/g) ?? []).length;

/**
 * Drawn node labels repeated in the post-draw reply. Rule 4 forbids describing
 * the drawing; three or more echoed labels is a node list in prose.
 */
export function echoedLabels(specs: Spec[], reply: string): number {
  const text = reply.toLowerCase();
  const labels = new Set(
    specs.flatMap((s) => s.nodes ?? []).map((n) => (n.label ?? "").toLowerCase()),
  );
  // Whole words, so "data" does not count inside "metadata".
  const word = (l: string) => new RegExp(`\\b${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return [...labels].filter((l) => l.length >= 4 && word(l).test(text)).length;
}
