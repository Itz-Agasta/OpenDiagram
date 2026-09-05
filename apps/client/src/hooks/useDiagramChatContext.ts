import {
  createContext,
  useContext,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import type { ChatMessage } from "#/lib/types";
import type { PendingAsk } from "#/lib/utils/diagram-chat";

export type DiagramChatAttachment = {
  type: "file";
  mediaType: string;
  filename: string;
  url: string;
};

export type DiagramChatContextValue = Pick<
  UseChatHelpers<ChatMessage>,
  | "messages"
  | "setMessages"
  | "sendMessage"
  | "status"
  | "error"
  | "addToolOutput"
  | "stop"
  | "clearError"
> & {
  persistTurn: (messages: UIMessage[]) => Promise<void>;
  threadLoaded: boolean;
  isHistorySeeded: boolean;
  skippedMessageIdsRef: RefObject<Set<string>>;
  pendingAsk: PendingAsk | null;
  answerAskUser: (toolCallId: string, output: string) => void;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  submitText: () => void;
  submitWithFiles: (files?: DiagramChatAttachment[]) => void;
  lastUserMessage: string | undefined;
  isLoading: boolean;
};

export const DiagramChatContext = createContext<DiagramChatContextValue | null>(null);

export function useDiagramChat(): DiagramChatContextValue {
  const context = useContext(DiagramChatContext);
  if (!context) {
    throw new Error("useDiagramChat must be used within DiagramChatProvider");
  }
  return context;
}
