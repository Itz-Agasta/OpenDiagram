/** Scene deltas: merging a save into the stored canvas without losing anyone's work. */
import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { isSceneDelta, mergeSceneDelta, pruneTombstones } from "../src/lib/scene-delta";

const el = (id: string, extra: Record<string, unknown> = {}) => ({ id, version: 1, ...extra });
const ids = (scene: unknown) => (scene as { elements: { id: string }[] }).elements.map((e) => e.id);
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => setSystemTime());

describe("isSceneDelta", () => {
  test("base (a revision or null) plus changed is a delta", () => {
    expect(isSceneDelta({ base: 3, changed: [] })).toBe(true);
    expect(isSceneDelta({ base: null, changed: [] })).toBe(true);
  });

  test("a whole scene is never a delta, even one carrying base and changed", () => {
    // Read as a delta, its elements would be dropped by the merge.
    expect(isSceneDelta({ base: 3, changed: [], elements: [el("a")] })).toBe(false);
  });

  test("anything else is not a delta", () => {
    for (const body of [
      null,
      "scene",
      3,
      {},
      { changed: [] },
      { base: "3", changed: [] },
      { base: 1, changed: {} },
    ])
      expect(isSceneDelta(body)).toBe(false);
  });
});

describe("mergeSceneDelta", () => {
  test("a changed element replaces its old copy, a new one is added, the rest stay", () => {
    const stored = { elements: [el("a"), el("b"), el("c")] };
    const next = mergeSceneDelta(stored, {
      base: 1,
      changed: [el("b", { version: 2 }), el("d")],
    }) as {
      elements: { id: string; version: number }[];
    };
    expect(next.elements.map((e) => [e.id, e.version])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 1],
      ["d", 1],
    ]);
  });

  test("a deletion is kept as a tombstone, not removed", () => {
    const next = mergeSceneDelta(
      { elements: [el("a")] },
      { base: 1, changed: [el("a", { isDeleted: true })] },
    );
    expect((next as { elements: unknown[] }).elements).toEqual([el("a", { isDeleted: true })]);
  });

  test("z-order follows the fractional index, ties broken by id", () => {
    // z is stored first, b arrives later with the same index: id order, not arrival, decides.
    const stored = { elements: [el("z", { index: "a1" }), el("a", { index: "a2" })] };
    const next = mergeSceneDelta(stored, {
      base: 1,
      changed: [el("c", { index: "a0" }), el("b", { index: "a1" })],
    });
    expect(ids(next)).toEqual(["c", "b", "z", "a"]);
  });

  test("a scene drawn before fractional indices keeps its array order", () => {
    const stored = { elements: [el("b"), el("a")] };
    expect(ids(mergeSceneDelta(stored, { base: 1, changed: [el("c", { index: "a0" })] }))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  test("appState is replaced when sent and kept when not; files are merged", () => {
    const stored = { elements: [], appState: { theme: "light" }, files: { f1: "one" } };
    const sent = mergeSceneDelta(stored, {
      base: 1,
      changed: [],
      appState: { theme: "dark" },
      files: { f2: "two" },
    });
    expect(sent).toMatchObject({ appState: { theme: "dark" }, files: { f1: "one", f2: "two" } });
    expect(mergeSceneDelta(stored, { base: 1, changed: [] })).toMatchObject({
      appState: { theme: "light" },
    });
  });

  test("a changed entry with no string id is ignored", () => {
    expect(
      ids(mergeSceneDelta({ elements: [el("a")] }, { base: 1, changed: [{ version: 2 }, null] })),
    ).toEqual(["a"]);
  });
});

describe("pruneTombstones", () => {
  test("drops tombstones older than a day, keeps younger ones and every live element", () => {
    const now = Date.UTC(2026, 10, 22, 12);
    setSystemTime(new Date(now));
    const scene = {
      elements: [
        el("live", { updated: now }),
        el("old", { isDeleted: true, updated: now - DAY - 1 }),
        el("fresh", { isDeleted: true, updated: now - DAY + 60_000 }),
        el("unstamped", { isDeleted: true }),
      ],
    };
    expect(ids(pruneTombstones(scene))).toEqual(["live", "fresh", "unstamped"]);
  });

  test("age is measured against the scene's newest stamp, so a slow client clock loses nothing", () => {
    // This client's clock runs two days behind the server's.
    setSystemTime(new Date(Date.UTC(2026, 10, 22, 12)));
    const clientNow = Date.UTC(2026, 10, 20, 12);
    const scene = {
      elements: [
        el("live", { updated: clientNow }),
        el("justDeleted", { isDeleted: true, updated: clientNow }),
      ],
    };
    expect(ids(pruneTombstones(scene))).toEqual(["live", "justDeleted"]);
  });

  test("one absurd future stamp cannot expire the rest: server time caps the reference", () => {
    const now = Date.UTC(2026, 10, 22, 12);
    setSystemTime(new Date(now));
    const scene = {
      elements: [
        el("future", { updated: now + 30 * DAY }),
        el("recent", { isDeleted: true, updated: now - 60_000 }),
      ],
    };
    expect(ids(pruneTombstones(scene))).toEqual(["future", "recent"]);
  });
});
