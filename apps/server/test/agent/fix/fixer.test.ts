/**
 * The layout fixer driven by a scripted model: what the loop keeps, undoes and
 * hands back. The harness re-solves and judges for real; only the model is fake.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  classicTheme,
  hardFaults,
  layoutDiagram,
  layoutPinned,
  type DiagramSpec,
  type PositionedSpec,
} from "@OpenDiagram/harness";
import type { RequestLogger } from "evlog";
import { createLayoutFixer, type FixEvent } from "../../../src/lib/agent/fix";
import { layoutCost, layoutLints } from "../../../src/lib/agent/fix/view";
import { CALL_USAGE, quietLog, scriptedModel } from "../../support/model";

const spec: DiagramSpec = {
  type: "system-design",
  title: "Fix",
  nodes: [
    { id: "a", label: "Web", category: "client" },
    { id: "b", label: "API", category: "service" },
    { id: "c", label: "Orders DB", category: "database" },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
  ],
};
// a and b overlap: a hard fault, so the loop runs without asking triage first.
const overlapping = () =>
  layoutPinned(
    spec,
    { a: { x: 0, y: 0 }, b: { x: 40, y: 0 }, c: { x: 600, y: 0 } },
    {},
    classicTheme,
  );

function run(model: ReturnType<typeof scriptedModel>, drawn: PositionedSpec, input = spec) {
  const log = quietLog();
  const usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const events: FixEvent[] = [];
  const fix = createLayoutFixer(model, classicTheme, log as unknown as RequestLogger, usage);
  return fix(input, drawn, (e) => events.push(e)).then((out) => ({ ...out, events, usage, log }));
}

const verdict = (events: FixEvent[]) => events.filter((e) => e.kind === "verdict").at(-1)?.text;
const keepsEveryNode = (p: PositionedSpec, s: DiagramSpec) => {
  for (const n of s.nodes) expect(p.positions[n.id], `node ${n.id}`).toBeDefined();
};

// compare() shows start and fix in a random order; 0.9 means "1" is the start, "2" the fix.
afterEach(() => spyOn(Math, "random").mockRestore());
const startIsDrawingOne = () => spyOn(Math, "random").mockReturnValue(0.9);

describe("layout fixer", () => {
  test("a move that clears the overlap is kept, and every token is billed", async () => {
    startIsDrawingOne();
    const drawn = overlapping();
    const model = scriptedModel([
      { tool: "move_nodes", input: { moves: [{ id: "b", x: 300, y: 0 }] } },
      { text: "Done." },
      { json: { better: "2" } },
    ]);
    const out = await run(model, drawn);
    expect(out.positioned.positions.b!.x).toBe(300);
    expect(hardFaults(out.positioned, classicTheme)).toBe(0);
    expect(out.stats.fix?.kept).toBe("fix");
    expect(verdict(out.events)).toBe("Applied the polished layout");
    keepsEveryNode(out.positioned, spec);
    // Two fix steps and one self-check.
    expect(out.usage).toMatchObject({
      inputTokens: 3 * CALL_USAGE.input,
      outputTokens: 3 * CALL_USAGE.output,
    });
  });

  test("a pass that ends with more hard faults than it started with is dropped", async () => {
    const drawn = overlapping();
    const model = scriptedModel([
      { tool: "move_nodes", input: { moves: [{ id: "c", x: 0, y: 0 }] } },
      { text: "Done." },
    ]);
    const out = await run(model, drawn);
    expect(out.positioned).toBe(drawn);
    expect(out.stats.fix?.reverted).toBe(1);
    expect(verdict(out.events)).toBe("No better layout found, kept the original");
  });

  test("when the self-check prefers the start, the start comes back", async () => {
    startIsDrawingOne();
    const drawn = overlapping();
    const model = scriptedModel([
      { tool: "move_nodes", input: { moves: [{ id: "b", x: 300, y: 0 }] } },
      { text: "Done." },
      { json: { better: "1" } },
    ]);
    const out = await run(model, drawn);
    expect(out.positioned).toBe(drawn);
    expect(out.stats.fix?.kept).toBe("start");
  });

  test("a model that fails mid-pass hands the original back, never throws", async () => {
    const drawn = overlapping();
    const out = await run(scriptedModel([{ throws: "503 overloaded" }]), drawn);
    expect(out.positioned).toBe(drawn);
    expect(out.spec).toBe(spec);
    expect(verdict(out.events)).toBe("Polishing stopped early, kept the original");
    expect(out.log.warnings).toContain("layout fix pass failed, keeping what it reached");
  });

  test("a diagram under three nodes is handed back without calling the model", async () => {
    const two: DiagramSpec = {
      ...spec,
      nodes: spec.nodes.slice(0, 2),
      edges: spec.edges.slice(0, 1),
    };
    const drawn = layoutPinned(two, { a: { x: 0, y: 0 }, b: { x: 40, y: 0 } }, {}, classicTheme);
    const model = scriptedModel([]);
    const out = await run(model, drawn, two);
    expect(out.positioned).toBe(drawn);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  describe("first look on a drawing whose numbers look fine", () => {
    const clean = () => layoutDiagram(spec, classicTheme);

    test("the drawing qualifies: no hard faults, score at or over 70, under 3 lints", async () => {
      const drawn = await clean();
      expect(hardFaults(drawn, classicTheme)).toBe(0);
      expect(layoutCost(drawn, classicTheme)).toBeGreaterThanOrEqual(70);
      expect(layoutLints(drawn, classicTheme).length).toBeLessThan(3);
    });

    test("a no from triage ends the pass after one call", async () => {
      const drawn = await clean();
      const model = scriptedModel([{ json: { problems: "", polish: false } }]);
      const out = await run(model, drawn);
      expect(out.positioned).toBe(drawn);
      expect(out.stats.triage).toEqual({ problems: "", polish: false });
      expect(model.doGenerateCalls).toHaveLength(1);
      expect(out.usage.inputTokens).toBe(CALL_USAGE.input);
    });

    test("a triage that fails skips the pass and keeps the drawing", async () => {
      const drawn = await clean();
      const out = await run(scriptedModel([{ throws: "timeout" }]), drawn);
      expect(out.positioned).toBe(drawn);
      expect(out.log.warnings).toContain("fix triage failed, skipping the fix");
    });
  });
});
