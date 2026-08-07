/** Sequence diagrams: lifelines, fragments, numbering, status colours. */
import { describe, expect, test } from "bun:test";
import {
  classicTheme,
  renderSequenceDiagram,
  sketchTheme,
  type DiagramSpec,
} from "../src/index.js";
import { allFinite } from "./helpers.js";

const seqSpec: DiagramSpec = {
  type: "sequence",
  title: "OAuth Login",
  nodes: [
    { id: "browser", label: "Browser" },
    { id: "web", label: "Web App", sublabel: "Next.js" },
    { id: "auth", label: "Auth Service" },
    { id: "db", label: "Database", category: "database" },
  ],
  edges: [
    { from: "browser", to: "web", label: "POST /login" },
    { id: "val", from: "web", to: "auth", label: "validate token" },
    { id: "ok", from: "auth", to: "web", label: "valid", kind: "success" },
    { id: "bad", from: "auth", to: "web", label: "401 Unauthorized", kind: "error" },
    { from: "auth", to: "auth", label: "sign JWT" },
    { from: "web", to: "browser", label: "200 OK", style: "dashed" },
    { from: "ghost", to: "web", label: "bad actor" }, // unknown actor — must be dropped
  ],
  groups: [
    {
      id: "alt1",
      label: "alt — token validation",
      contains: ["val", "ok", "bad"],
      sections: [
        { label: "valid token", startsAt: "ok" },
        { label: "invalid token", startsAt: "bad" },
      ],
    },
  ],
};

describe.each([classicTheme, sketchTheme])("sequence ($id theme)", (theme) => {
  const r = renderSequenceDiagram(seqSpec, theme);
  const arrows = r.skeletons.filter((s) => s.kind === "arrow");

  test("drops unknown actors with a warning", () => {
    expect(r.warnings.some((w) => w.includes("ghost"))).toBe(true);
  });

  test("emits 4 lifelines + 6 messages + 2 section dividers", () => {
    expect(arrows.length).toBe(12);
  });

  test("all coordinates finite", () => {
    expect(allFinite(r.skeletons)).toBe(true);
  });

  test("frame wraps every skeleton", () => {
    const frame = r.skeletons.find((s) => s.kind === "frame");
    expect(frame?.kind).toBe("frame");
    if (frame?.kind === "frame") expect(frame.children.length).toBe(r.skeletons.length - 1);
  });

  test("messages auto-number when more than 3", () => {
    const lbl = r.skeletons.find((s) => s.kind === "text" && s.id === "val-label");
    expect(lbl?.kind === "text" && lbl.text).toBe("2. validate token");
  });

  test("error red / success green on arrows", () => {
    const bad = arrows.find((a) => a.id === "bad");
    const ok = arrows.find((a) => a.id === "ok");
    expect(bad?.kind === "arrow" && bad.strokeColor).toBe(theme.edge.errorStroke);
    expect(ok?.kind === "arrow" && ok.strokeColor).toBe(theme.edge.successStroke);
  });

  test("fragment box: square, tinted, drawn behind lifelines", () => {
    const fragIdx = r.skeletons.findIndex((s) => s.id === "fragment-alt1");
    const lifeIdx = r.skeletons.findIndex((s) => s.id === "lifeline-browser");
    const frag = r.skeletons[fragIdx];
    expect(fragIdx).toBeGreaterThanOrEqual(0);
    expect(fragIdx).toBeLessThan(lifeIdx);
    expect(frag?.kind === "container" && frag.rounded).toBe(false);
    expect(frag?.kind === "container" && frag.backgroundColor).toBe("#f1f5f9");
  });

  test("alt sections render labels and a divider between branches", () => {
    const divider = r.skeletons.find((s) => s.id === "fragment-alt1-divider-1");
    const s0 = r.skeletons.find((s) => s.kind === "text" && s.id === "fragment-alt1-section-0");
    const ok = arrows.find((a) => a.id === "ok");
    const bad = arrows.find((a) => a.id === "bad");
    expect(s0?.kind === "text" && s0.text).toBe("[valid token]");
    if (divider?.kind === "arrow" && ok?.kind === "arrow" && bad?.kind === "arrow") {
      expect(divider.y).toBeGreaterThan(ok.y);
      expect(divider.y).toBeLessThan(bad.y);
    } else {
      throw new Error("missing divider or branch arrows");
    }
  });

  test("actor boxes repeat at the bottom", () => {
    expect(r.skeletons.some((s) => s.id === "browser-bottom")).toBe(true);
  });
});

test("short sequences skip numbering", () => {
  const short = renderSequenceDiagram(
    { ...seqSpec, edges: seqSpec.edges.slice(0, 2), groups: [] },
    classicTheme,
  );
  const lbl = short.skeletons.find((s) => s.kind === "text" && s.id === "val-label");
  expect(lbl?.kind === "text" && lbl.text).toBe("validate token");
});
