import { useEffect, useRef, type RefObject } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import type { CanvasDiagram } from "#/lib/utils/canvas-diagrams";
import { toPromptDiagrams } from "#/lib/utils/canvas-diagrams";
import {
  fetchDiagramChat,
  lastAssistantMessageIsCompleteWithAskUser,
  stripDrawDiagramOutput,
} from "#/lib/utils/diagram-chat";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

/**
 * Diagram agent chat for one file.
 *
 * Owns the AI SDK transport + `useChat`. The canvas list and model pick are
 * read through refs so a draw that lands mid-turn is on the next request
 * without rebuilding the transport. `ask_user` is a client tool: after the
 * user answers, `sendAutomaticallyWhen` continues the turn. Completed turns
 * are appended to the thread in `onFinish`.
 */
export function useDiagramChat(options: {
  fileId: string;
  diagramsRef: RefObject<CanvasDiagram[]>;
  modelId: string | null;
  providerId: string | null;
  persistTurn: (messages: UIMessage[]) => Promise<void>;
}) {
  const { fileId, diagramsRef, modelId, providerId, persistTurn } = options;

  const modelIdRef = useRef(modelId);
  const providerIdRef = useRef(providerId);
  const persistTurnRef = useRef(persistTurn);

  useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);

  useEffect(() => {
    providerIdRef.current = providerId;
  }, [providerId]);

  useEffect(() => {
    persistTurnRef.current = persistTurn;
  }, [persistTurn]);

  // Created once. `body()` is a callback, so later draws/model changes are
  // visible without replacing the transport (which would reset the chat).
  const transport = useRef<DefaultChatTransport<UIMessage> | null>(null);
  if (!transport.current) {
    transport.current = new DefaultChatTransport<UIMessage>({
      api: `${SERVER_URL.replace(/\/$/, "")}/api/diagram/chat`,
      body: () => ({
        diagrams: toPromptDiagrams(diagramsRef.current ?? []),
        theme: "sketch",
        modelId: modelIdRef.current || undefined,
        providerId: providerIdRef.current || undefined,
      }),
      // Returning a body replaces the default, so id/trigger/messageId must
      // be forwarded. Skeletons stay in the UI; the server only needs summaries.
      prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
        body: { ...body, id, messages: stripDrawDiagramOutput(messages), trigger, messageId },
      }),
      fetch: fetchDiagramChat as typeof fetch,
    });
  }

  return useChat({
    id: fileId,
    transport: transport.current,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithAskUser,
    onFinish: ({ messages }) => {
      void persistTurnRef.current(messages);
    },
  });
}
