import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { UIMessage } from "ai";
import { appendStoredChatMessage } from "./chat-timeline";

describe("appendStoredChatMessage", () => {
  test("places a project-routed message after the existing diagram conversation", () => {
    const existing: UIMessage[] = [
      { id: "diagram-user", role: "user", parts: [{ type: "text", text: "Draw a system" }] },
      {
        id: "diagram-assistant",
        role: "assistant",
        parts: [{ type: "text", text: "Diagram created" }],
      },
    ];

    const updated = appendStoredChatMessage(existing, {
      id: "project-user",
      role: "user",
      text: "Explain the database choice",
    });

    assert.deepEqual(
      updated.map((message) => message.id),
      ["diagram-user", "diagram-assistant", "project-user"],
    );
    assert.equal(existing.length, 2);
  });
});
