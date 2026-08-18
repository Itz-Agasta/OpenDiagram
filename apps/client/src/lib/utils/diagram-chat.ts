import type { DiagramSpec, RenderSkeleton } from "@OpenDiagram/harness";
import type { UIMessage } from "ai";
import {
  CreationQuotaError,
  AiProviderCreditError,
  UpstreamRateLimitError,
  type CreationQuota,
} from "../types";

export type AskUserInput = {
  question: string;
  options: string[];
};

export type DrawDiagramOutput = {
  skeletons?: RenderSkeleton[];
  rawElements?: unknown[];
  summary?: { title: string; nodes: number; edges: number; warnings?: string[] };
};

export type DrawDiagramInput = DiagramSpec & { targetId?: string };

export type ChatToolPart = {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export function isAskUserPart(
  part: { type?: string; toolName?: string } | undefined,
): part is ChatToolPart {
  return (
    part?.type === "tool-ask_user" ||
    (part?.type === "dynamic-tool" && part.toolName === "ask_user")
  );
}

export function isDrawDiagramPart(
  part: { type?: string; toolName?: string } | undefined,
): part is ChatToolPart {
  return (
    part?.type === "tool-draw_diagram" ||
    (part?.type === "dynamic-tool" && part.toolName === "draw_diagram")
  );
}

export function pendingAskUser(messages: UIMessage[]) {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return null;

  for (const part of last.parts) {
    if (isAskUserPart(part) && part.state === "input-available") {
      return {
        toolCallId: part.toolCallId,
        input: part.input as AskUserInput,
      };
    }
  }

  return null;
}

/**
 * Drop Excalidraw element JSON from past `draw_diagram` outputs before upload.
 * The browser needs skeletons/rawElements to paint; the server only needs summary.
 */
export function stripDrawDiagramOutput(messages: UIMessage[]): UIMessage[] {
  let touchedAny = false;

  const next = messages.map((message) => {
    let touched = false;

    const parts = message.parts.map((part) => {
      if (!isDrawDiagramPart(part) || part.state !== "output-available") return part;

      const output = part.output as DrawDiagramOutput | undefined;
      if (!output || typeof output !== "object") return part;
      if (!("skeletons" in output || "rawElements" in output)) return part;

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
  if (data?.code === "byok_credit_exhausted") {
    throw new AiProviderCreditError(message);
  }
  if (response.status === 429) {
    throw new UpstreamRateLimitError(message);
  }

  throw new Error(message);
}
