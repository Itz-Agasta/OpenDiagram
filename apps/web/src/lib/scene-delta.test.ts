/**
 * The client half of scene deltas, and the round trip through the server's
 * merge: whatever the user did, the stored scene must end up equal to theirs.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import fc from "fast-check";
import { mergeSceneDelta } from "../../../server/src/lib/scene-delta";
import { encodeScene, resetSceneDelta, seedSceneDelta } from "./scene-delta";

type El = {
  id: string;
  index: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  x?: number;
};
const el = (id: string, index: string, version = 1, extra: Partial<El> = {}): El => ({
  id,
  index,
  version,
  versionNonce: version * 7,
  ...extra,
});
const FILE = "f1";
type Wire = { base: number | null; changed: unknown[]; files?: Record<string, unknown> };

beforeEach(() => resetSceneDelta(FILE));

describe("encodeScene", () => {
  test("the first save after opening sends the whole scene", () => {
    const scene = { elements: [el("a", "a0")] };
    assert.equal(encodeScene(FILE, scene).wire, scene);
  });

  test("after a seed, only elements whose stamp moved are sent, against the seeded revision", () => {
    seedSceneDelta(FILE, { elements: [el("a", "a0"), el("b", "a1")] }, 4);
    const wire = encodeScene(FILE, {
      elements: [el("a", "a0"), el("b", "a1", 2), el("c", "a2")],
    }).wire as Wire;
    assert.equal(wire.base, 4);
    assert.deepEqual(wire.changed, [el("b", "a1", 2), el("c", "a2")]);
  });

  test("the same version with a different nonce is a change: two devices both reached n+1", () => {
    seedSceneDelta(FILE, { elements: [el("a", "a0", 2)] }, 1);
    const other = { ...el("a", "a0", 2), versionNonce: 999 };
    assert.deepEqual((encodeScene(FILE, { elements: [other] }).wire as Wire).changed, [other]);
  });

  test("a scene without fractional indices always goes whole: its order lives in the array", () => {
    seedSceneDelta(FILE, { elements: [{ id: "a", version: 1 }] }, 1);
    const scene = { elements: [{ id: "a", version: 1 }] };
    assert.equal(encodeScene(FILE, scene).wire, scene);
  });

  test("a file blob is sent once, then never again", () => {
    seedSceneDelta(FILE, { elements: [el("a", "a0")], files: { old: "x" } }, 1);
    const scene = { elements: [el("a", "a0")], files: { old: "x", fresh: "y" } };
    const first = encodeScene(FILE, scene);
    assert.deepEqual((first.wire as Wire).files, { fresh: "y" });
    first.commit(2);
    assert.equal("files" in (encodeScene(FILE, scene).wire as Wire), false);
  });

  test("the unload beacon asks to merge onto the server's current revision", () => {
    seedSceneDelta(FILE, { elements: [el("a", "a0")] }, 7);
    const wire = encodeScene(FILE, { elements: [el("a", "a0", 2)] }, { withBase: false }).wire;
    assert.equal((wire as Wire).base, null);
  });

  test("a write that returns no revision drops the baseline: the next save is whole", () => {
    seedSceneDelta(FILE, { elements: [el("a", "a0")] }, 1);
    encodeScene(FILE, { elements: [el("a", "a0", 2)] }).commit(undefined);
    const scene = { elements: [el("a", "a0", 3)] };
    assert.equal(encodeScene(FILE, scene).wire, scene);
  });
});

// Fractional indices sort as plain strings, which is how both sides order them.
const index = fc.stringMatching(/^a[0-9A-Za-z]{1,3}$/);
const element = (id: string) =>
  fc
    .record({ index, version: fc.integer({ min: 1, max: 5 }), x: fc.integer({ min: 0, max: 500 }) })
    .map((r): El => ({ id, ...r, versionNonce: r.version * 7 }));
const byIndex = (a: El, b: El) =>
  a.index !== b.index ? (a.index < b.index ? -1 : 1) : a.id.localeCompare(b.id);

describe("round trip through the server merge", () => {
  test("for any edit, merging the client's delta into the stored scene gives the client's scene", () => {
    const scenario = fc
      .uniqueArray(fc.stringMatching(/^[a-z]{1,3}$/), { minLength: 1, maxLength: 12 })
      .chain((ids) =>
        fc.record({
          stored: fc.tuple(...ids.map(element)),
          // Per element: keep, edit (move/restack), or delete.
          edits: fc.array(fc.constantFrom("keep", "edit", "delete"), {
            minLength: ids.length,
            maxLength: ids.length,
          }),
          moves: fc.array(fc.tuple(index, fc.integer({ min: 0, max: 500 })), {
            minLength: ids.length,
            maxLength: ids.length,
          }),
          added: fc.array(
            element("new").map((e) => e),
            { maxLength: 3 },
          ),
        }),
      );
    fc.assert(
      fc.property(scenario, ({ stored, edits, moves, added }) => {
        resetSceneDelta(FILE);
        const storedScene = { elements: [...stored].sort(byIndex) };
        seedSceneDelta(FILE, storedScene, 1);
        const local = stored.map((e, i): El => {
          if (edits[i] === "keep") return e;
          const bumped = { ...e, version: e.version + 1, versionNonce: (e.version + 1) * 7 + i };
          if (edits[i] === "delete") return { ...bumped, isDeleted: true };
          return { ...bumped, index: moves[i]![0], x: moves[i]![1] };
        });
        added.forEach((e, i) => local.push({ ...e, id: `new${i}` }));
        const clientScene = { elements: [...local].sort(byIndex) };

        const { wire } = encodeScene(FILE, clientScene);
        const merged = mergeSceneDelta(storedScene, wire as never) as { elements: El[] };
        assert.deepEqual(merged.elements, clientScene.elements);
      }),
      { numRuns: 200, seed: 20261122 },
    );
  });
});
