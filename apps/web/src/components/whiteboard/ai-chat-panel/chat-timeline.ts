import type { UIMessage } from "ai";
import { storedChatMessageToUIMessage, type StoredChatMessage } from "@/lib/chat-history";

export function appendStoredChatMessage(
  messages: UIMessage[],
  message: StoredChatMessage,
): UIMessage[] {
  return [...messages, storedChatMessageToUIMessage(message)];
}
