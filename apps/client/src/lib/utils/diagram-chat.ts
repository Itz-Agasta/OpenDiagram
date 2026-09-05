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

export function normalizeToolPart(part: any): ChatToolPart | null {
  if (!part) return null;

  if (part.type === "tool-invocation") {
    const inv = part.toolInvocation;
    if (!inv) return null;

    let state: ChatToolPart["state"] = "input-available";
    if (inv.state === "calling") {
      state = "input-streaming";
    } else if (inv.state === "result") {
      state = "output-available";
    }

    return {
      type: `tool-${inv.toolName}`,
      toolCallId: inv.toolCallId,
      state,
      input: inv.args,
      output: inv.result,
      errorText: inv.errorText,
    };
  }

  if (
    part.type === "tool-ask_user" ||
    part.type === "tool-draw_diagram" ||
    part.type === "dynamic-tool"
  ) {
    const toolName = part.type === "dynamic-tool" ? part.toolName : part.type.replace("tool-", "");
    return {
      type: `tool-${toolName}`,
      toolCallId: part.toolCallId,
      state: part.state,
      input: part.input,
      output: part.output,
      errorText: part.errorText,
    };
  }

  return null;
}

export function isAskUserPart(part: any): part is ChatToolPart {
  const norm = normalizeToolPart(part);
  return norm?.type === "tool-ask_user";
}

export function isDrawDiagramPart(part: any): part is ChatToolPart {
  const norm = normalizeToolPart(part);
  return norm?.type === "tool-draw_diagram";
}

export type PendingAsk = {
  toolCallId: string;
  input: AskUserInput;
};

export function pendingAskUser(messages: UIMessage[]): PendingAsk | null {
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
 * Continue the turn only after the user answers `ask_user`.
 *
 * `lastAssistantMessageIsCompleteWithToolCalls` also matches server-executed
 * `draw_diagram` (no `providerExecuted` flag), which auto-sent a second
 * request after every draw.
 */
export function lastAssistantMessageIsCompleteWithAskUser({
  messages,
}: {
  messages: UIMessage[];
}): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;

  const lastStepStartIndex = last.parts.reduce(
    (lastIndex, part, index) => (part.type === "step-start" ? index : lastIndex),
    -1,
  );
  const asks: ChatToolPart[] = [];
  for (const part of last.parts.slice(lastStepStartIndex + 1)) {
    if (isAskUserPart(part)) asks.push(part);
  }
  return (
    asks.length > 0 &&
    asks.every((part) => part.state === "output-available" || part.state === "output-error")
  );
}

/**
 * Drop Excalidraw element JSON from past `draw_diagram` outputs before upload.
 * The browser needs skeletons/rawElements to paint; the server only needs summary.
 */
export function stripDrawDiagramOutput<T extends UIMessage>(messages: T[]): T[] {
  let touchedAny = false;

  const next = messages.map((message) => {
    let touched = false;

    const parts = message.parts.map((rawPart: any) => {
      const part = (normalizeToolPart(rawPart) || rawPart) as any;
      if (!isDrawDiagramPart(rawPart) || part.state !== "output-available") return rawPart;

      const output = part.output as DrawDiagramOutput | undefined;
      if (!output || typeof output !== "object") return rawPart;
      if (!("skeletons" in output || "rawElements" in output)) return rawPart;

      touched = true;
      if ((rawPart as any).type === "tool-invocation") {
        return {
          ...rawPart,
          toolInvocation: {
            ...(rawPart as any).toolInvocation,
            result: { summary: output.summary },
          },
        } as any;
      }
      return { ...rawPart, output: { summary: output.summary } } as any;
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
