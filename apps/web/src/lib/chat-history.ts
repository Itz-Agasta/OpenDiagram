import type { UIMessage } from "ai";

export type StoredAskUserInput = {
  question: string;
  options: string[];
};

export type StoredAskUserCall =
  | {
      toolCallId: string;
      state: "input-available";
      input: StoredAskUserInput;
    }
  | {
      toolCallId: string;
      state: "output-available";
      input: StoredAskUserInput;
      output: string;
    };

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  askUserCalls?: StoredAskUserCall[];
};

function isAskUserInput(value: unknown): value is StoredAskUserInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<StoredAskUserInput>;
  return (
    typeof input.question === "string" &&
    Array.isArray(input.options) &&
    input.options.every((option) => typeof option === "string")
  );
}

function isStoredAskUserCall(value: unknown): value is StoredAskUserCall {
  if (!value || typeof value !== "object") return false;
  const call = value as Partial<StoredAskUserCall>;
  if (typeof call.toolCallId !== "string" || !isAskUserInput(call.input)) return false;
  return (
    call.state === "input-available" ||
    (call.state === "output-available" && typeof call.output === "string")
  );
}

function isStoredChatMessage(value: unknown): value is StoredChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredChatMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.text === "string" &&
    (message.askUserCalls === undefined ||
      (Array.isArray(message.askUserCalls) && message.askUserCalls.every(isStoredAskUserCall)))
  );
}

export function uiMessageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function storedChatMessageToUIMessage(message: StoredChatMessage): UIMessage {
  const parts: UIMessage["parts"] = message.text ? [{ type: "text", text: message.text }] : [];
  for (const call of message.askUserCalls ?? []) {
    parts.push(
      call.state === "input-available"
        ? {
            type: "tool-ask_user",
            toolCallId: call.toolCallId,
            state: call.state,
            input: call.input,
          }
        : {
            type: "tool-ask_user",
            toolCallId: call.toolCallId,
            state: call.state,
            input: call.input,
            output: call.output,
          },
    );
  }

  return { id: message.id, role: message.role, parts };
}

export function uiMessageToStoredChatMessage(message: UIMessage): StoredChatMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null;
  const text = uiMessageText(message);
  const askUserCalls = message.parts.flatMap((part): StoredAskUserCall[] => {
    if (part.type !== "tool-ask_user" || !isAskUserInput(part.input)) return [];
    if (part.state === "input-available") {
      return [{ toolCallId: part.toolCallId, state: part.state, input: part.input }];
    }
    if (part.state === "output-available" && typeof part.output === "string") {
      return [
        {
          toolCallId: part.toolCallId,
          state: part.state,
          input: part.input,
          output: part.output,
        },
      ];
    }
    return [];
  });

  return text || askUserCalls.length > 0
    ? {
        id: message.id,
        role: message.role,
        text,
        ...(askUserCalls.length > 0 ? { askUserCalls } : {}),
      }
    : null;
}

export function normalizeStoredChatHistory(history?: unknown[]) {
  return (history ?? []).flatMap((entry) => {
    if (isStoredChatMessage(entry)) return [entry];
    if (
      entry &&
      typeof entry === "object" &&
      "parts" in entry &&
      Array.isArray((entry as UIMessage).parts)
    ) {
      const message = uiMessageToStoredChatMessage(entry as UIMessage);
      return message ? [message] : [];
    }
    return [];
  });
}

export function uiMessagesToStoredChatHistory(messages: UIMessage[]) {
  return messages.flatMap((message) => {
    const stored = uiMessageToStoredChatMessage(message);
    return stored ? [stored] : [];
  });
}
