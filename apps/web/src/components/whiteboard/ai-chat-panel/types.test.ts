import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isRepoGeneratedSpec, shouldUseDiagramChatDirectly } from "./types";

describe("isRepoGeneratedSpec", () => {
  test("distinguishes repository-generated files from normal diagrams", () => {
    assert.equal(isRepoGeneratedSpec({ kind: "repo_generated" }), true);
    assert.equal(isRepoGeneratedSpec({ type: "system-design", nodes: [], edges: [] }), false);
    assert.equal(isRepoGeneratedSpec(undefined), false);
  });

  test("routes only normal diagram files directly to diagram chat", () => {
    assert.equal(shouldUseDiagramChatDirectly("diagram", { type: "system-design" }), true);
    assert.equal(shouldUseDiagramChatDirectly("diagram", { kind: "repo_generated" }), false);
    assert.equal(shouldUseDiagramChatDirectly("doc", { type: "system-design" }), false);
  });
});
