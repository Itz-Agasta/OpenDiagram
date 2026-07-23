import type { UIMessage } from "ai";
import type { StoredAskUserInput } from "@/lib/chat-history";
import {
  AiProviderCreditError,
  CreationQuotaError,
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

export function diagramRequestLikely(text: string) {
  return /\b(diagram|flowchart|sequence|architecture|system flow|request flow|data flow|canvas|whiteboard|draw|sketch|map)\b/i.test(
    text,
  );
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

  throw new Error(message);
}
