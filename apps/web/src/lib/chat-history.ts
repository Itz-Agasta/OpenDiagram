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

export type StoredChatPart =
  | { type: "text"; text: string }
  | {
      type: "tool-ask_user";
      toolCallId: string;
      state: "input-available";
      input: StoredAskUserInput;
    }
  | {
      type: "tool-ask_user";
      toolCallId: string;
      state: "output-available";
      input: StoredAskUserInput;
      output: string;
    }
  | {
      type: "tool-ask_user";
      toolCallId: string;
      state: "output-error";
      input?: StoredAskUserInput;
      errorText: string;
    };

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  parts?: StoredChatPart[];
  /** Legacy shape retained so histories saved before ordered parts still load. */
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

function isStoredChatPart(value: unknown): value is StoredChatPart {
  if (!value || typeof value !== "object") return false;
  const part = value as Partial<StoredChatPart>;
  if (part.type === "text") return typeof part.text === "string";
  if (part.type !== "tool-ask_user" || typeof part.toolCallId !== "string") return false;
  if (part.state === "output-error") {
    return (
      (part.input === undefined || isAskUserInput(part.input)) && typeof part.errorText === "string"
    );
  }
  if (!isAskUserInput(part.input)) return false;
  return (
    part.state === "input-available" ||
    (part.state === "output-available" && typeof part.output === "string")
  );
}

function isStoredChatMessage(value: unknown): value is StoredChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredChatMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.text === "string" &&
    (message.parts === undefined ||
      (Array.isArray(message.parts) && message.parts.every(isStoredChatPart))) &&
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

function storedPartToUIMessagePart(part: StoredChatPart): UIMessage["parts"][number] {
  if (part.type === "text") return part;
  if (part.state === "input-available") return part;
  if (part.state === "output-available") return part;
  return {
    type: "tool-ask_user",
    toolCallId: part.toolCallId,
    state: "output-error",
    input: part.input,
    errorText: part.errorText,
  };
}

export function storedChatMessageToUIMessage(message: StoredChatMessage): UIMessage {
  if (message.parts) {
    return {
      id: message.id,
      role: message.role,
      parts: message.parts.map(storedPartToUIMessagePart),
    };
  }

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

function uiPartToStoredPart(part: UIMessage["parts"][number]): StoredChatPart | null {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type !== "tool-ask_user") return null;

  if (part.state === "input-streaming") {
    return {
      type: "tool-ask_user",
      toolCallId: part.toolCallId,
      state: "output-error",
      ...(isAskUserInput(part.input) ? { input: part.input } : {}),
      errorText: "Question generation was interrupted. Please try again.",
    };
  }
  if (part.state === "output-error") {
    return {
      type: "tool-ask_user",
      toolCallId: part.toolCallId,
      state: "output-error",
      ...(isAskUserInput(part.input) ? { input: part.input } : {}),
      errorText: part.errorText,
    };
  }
  if (!isAskUserInput(part.input)) return null;
  if (part.state === "input-available") {
    return {
      type: "tool-ask_user",
      toolCallId: part.toolCallId,
      state: part.state,
      input: part.input,
    };
  }
  if (part.state === "output-available" && typeof part.output === "string") {
    return {
      type: "tool-ask_user",
      toolCallId: part.toolCallId,
      state: part.state,
      input: part.input,
      output: part.output,
    };
  }
  return null;
}

export function uiMessageToStoredChatMessage(message: UIMessage): StoredChatMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null;
  const parts = message.parts.flatMap((part) => {
    const stored = uiPartToStoredPart(part);
    return stored ? [stored] : [];
  });

  return parts.length > 0
    ? { id: message.id, role: message.role, text: uiMessageText(message), parts }
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
