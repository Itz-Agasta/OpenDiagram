/** repairToolInput: the deterministic fix for Gemini's mangled edge keys in draw tool calls. */
import { describe, expect, test } from "bun:test";
import { repairToolInput } from "../../src/lib/agent/chat-stream";

const diagram = (edges: object[]) => ({
  type: "system-design",
  title: "Shop",
  nodes: [
    { id: "web", label: "Web" },
    { id: "api", label: "API" },
  ],
  edges,
});

const system = (links: object[], steps: object[]) => ({
  title: "Shop",
  domains: [{ id: "core", label: "Core" }],
  components: [
    { id: "web", label: "Web", category: "client", icon: "none", domain: "shared" },
    { id: "api", label: "API", category: "service", icon: "none", domain: "core" },
  ],
  links,
  flows: [{ title: "Checkout", type: "flow", steps }],
});

const parsed = (out: string | null) => JSON.parse(out!) as Record<string, any>;

describe("repairToolInput", () => {
  test("draw_diagram: from1/to1 become from/to", () => {
    const out = repairToolInput(
      "draw_diagram",
      JSON.stringify(diagram([{ from1: "web", to1: "api" }])),
    );
    expect(parsed(out).edges).toEqual([{ from: "web", to: "api" }]);
  });

  test("draw_diagram: source/target become from/to, and an object input works too", () => {
    const out = repairToolInput("draw_diagram", diagram([{ source: "web", target: "api" }]));
    expect(parsed(out).edges).toEqual([{ from: "web", to: "api" }]);
  });

  test("a key already present is never overwritten by its misspelling", () => {
    const out = repairToolInput(
      "draw_diagram",
      diagram([{ from: "web", from1: "api", to: "api" }]),
    );
    expect(parsed(out).edges[0].from).toBe("web");
  });

  test("draw_system: links and every flow's steps are repaired", () => {
    const out = parsed(
      repairToolInput(
        "draw_system",
        system([{ from1: "web", to1: "api" }], [{ source: "web", target: "api", label: "Pay" }]),
      ),
    );
    expect(out.links).toEqual([{ from: "web", to: "api" }]);
    expect(out.flows[0].steps).toEqual([{ from: "web", to: "api", label: "Pay" }]);
  });

  test("an input still invalid after the fixups is left to the normal tool error", () => {
    // A valid diagram whose edge still has no `to` once `from1` is renamed.
    expect(repairToolInput("draw_diagram", JSON.stringify(diagram([{ from1: "web" }])))).toBeNull();
  });

  test("a tool it does not know, or input that is not JSON, is not touched", () => {
    expect(repairToolInput("ask_user", JSON.stringify({ question: "?" }))).toBeNull();
    expect(repairToolInput("draw_diagram", "{not json")).toBeNull();
  });
});
