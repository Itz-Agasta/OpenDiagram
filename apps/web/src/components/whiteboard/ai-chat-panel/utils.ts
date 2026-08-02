import type { UIMessage } from "ai";
import type { StoredAskUserInput } from "@/lib/chat-history";
import {
  AiProviderCreditError,
  CreationQuotaError,
  UpstreamRateLimitError,
  type CreationQuota,
} from "@/lib/projects-client";

export function pendingAskUser(messages: UIMessage[]) {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return null;

  for (const part of last.parts) {
    if (part.type === "tool-ask_user" && part.state === "input-available") {
      return {
        toolCallId: part.toolCallId,
        input: part.input as StoredAskUserInput,
      };
    }
  }

  return null;
}

/**
 * Drop the rendered element JSON from past `draw_diagram` calls before upload.
 *
 * The tool's output carries `skeletons` and `rawElements` -- the whole Excalidraw
 * payload, ~184 elements per diagram -- alongside a four-field `summary`. The
 * browser needs the elements: `use-diagram-canvas` draws them. The SERVER never
 * looks at them, because `draw_diagram` declares a `toModelOutput` that reduces
 * the result to `summary` before it reaches the model.
 *
 * But `DefaultChatTransport` uploads the message array verbatim, so every turn
 * re-sent every past diagram's element JSON to be parsed, validated and thrown
 * away. On a canvas whose scene runs to 311 kB for 369 elements, that is roughly
 * 150 kB per past diagram on every message.
 *
 * Only `output` is trimmed. `input` (the spec) is left alone on purpose: the model
 * does read its own past tool calls, and there is no measurement here saying it is
 * safe to remove -- the CANVAS block in the system prompt makes it *probably*
 * redundant, which is not the same thing.
 *
 * Returns the original array when nothing needed trimming, so a conversation with
 * no diagrams in it does no copying.
 */
export function stripDrawDiagramOutput(messages: UIMessage[]): UIMessage[] {
  let touchedAny = false;

  const next = messages.map((message) => {
    let touched = false;

    const parts = message.parts.map((part) => {
      if (part.type !== "tool-draw_diagram" || part.state !== "output-available") return part;

      const output = part.output as { summary?: unknown } | undefined;
      // Already trimmed, or an unexpected shape -- leave it rather than guess.
      if (!output || !("skeletons" in output || "rawElements" in output)) return part;

      touched = true;
      return { ...part, output: { summary: output.summary } };
    });

    if (!touched) return message;
    touchedAny = true;
    return { ...message, parts };
  });

  return touchedAny ? next : messages;
}

export async function fetchDiagramChat(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { ...init, credentials: "include" });
  if (response.ok) return response;

  const data = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    quota?: CreationQuota;
  } | null;
  const message = data?.error ?? "The diagram agent is unavailable. Try again.";

  if (data?.code === "creation_quota_exceeded") {
    throw new CreationQuotaError(message, data.quota);
  }
  if (data?.code === "byok_credit_exhausted") throw new AiProviderCreditError(message);
  if (response.status === 429) throw new UpstreamRateLimitError(message);

  throw new Error(message);
}
