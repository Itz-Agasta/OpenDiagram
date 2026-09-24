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
 * Text a reader can actually see as a concept. A listed sublabel contributes only
 * its first item: counting the whole list is what let a 12-node merge of a 30-part
 * system score 0.80 coverage.
 */
function visibleText(specs: Spec[]): string {
  const parts: string[] = [];
  for (const spec of specs) {
    for (const n of spec.nodes ?? []) {
      parts.push(n.label ?? "");
      if (n.sublabel) parts.push(isList(n.sublabel) ? n.sublabel.split(/[,;]/)[0]! : n.sublabel);
    }
    for (const e of spec.edges ?? []) parts.push(e.label ?? "");
    for (const g of [...(spec.groups ?? []), ...(spec.zones ?? [])]) parts.push(g.label ?? "");
  }
  return parts.join("\n").toLowerCase();
}

// Word-start match, so "eta" does not score inside "metadata"; stems like "retriev" still work.
const hit = (text: string, term: string) =>
  term.split("|").some((alt) => new RegExp(`\\b${alt}`).test(text));

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
  const text = visibleText(specs);
  return (prompt.forbid ?? []).filter((k) => hit(text, k));
}

export function stuffed(specs: Spec[]): number {
  return specs.flatMap((s) => s.nodes ?? []).filter((n) => n.sublabel && isList(n.sublabel)).length;
}
