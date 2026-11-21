/** Releasing polish locks on load, and that the release reaches the stored scene. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { releasePolishLocks } from "./excalidraw-utils";
import { encodeScene, seedSceneDelta } from "./scene-delta";

// A scene saved mid polish: frame renamed and locked, its member locked, one bystander.
const stored = [
  {
    id: "frame",
    type: "frame",
    index: "a0",
    version: 3,
    versionNonce: 1,
    locked: true,
    name: "Shop · polishing…",
    customData: { polishing: "Shop" },
  },
  {
    id: "box",
    type: "rectangle",
    index: "a1",
    version: 5,
    versionNonce: 2,
    locked: true,
    customData: { polishing: true, role: "node" },
  },
  { id: "note", type: "text", index: "a2", version: 1, versionNonce: 3, locked: false },
];

describe("releasePolishLocks", () => {
  test("unlocks the frame and its members and gives the frame its real name back", () => {
    const [frame, box] = releasePolishLocks(stored) as typeof stored;
    assert.equal(frame!.locked, false);
    assert.equal(frame!.name, "Shop");
    assert.deepEqual(frame!.customData, {});
    assert.equal(box!.locked, false);
    assert.deepEqual(box!.customData, { role: "node" });
  });

  test("leaves every element that was not polishing exactly as it was", () => {
    assert.equal(releasePolishLocks(stored)[2], stored[2]);
  });

  test("the release travels in the next delta save, so the stored scene unlocks too", () => {
    seedSceneDelta("canvas", { elements: stored }, 9);
    const released = releasePolishLocks(stored);
    const wire = encodeScene("canvas", { elements: released }).wire as {
      changed: { id: string; locked: boolean; name?: string }[];
    };
    // The released copies themselves, not just their ids: what the server stores.
    assert.deepEqual(wire.changed, released.slice(0, 2));
    const [frame, box] = wire.changed;
    assert.equal(frame!.locked, false);
    assert.equal(frame!.name, "Shop");
    assert.equal(box!.locked, false);
  });
});
