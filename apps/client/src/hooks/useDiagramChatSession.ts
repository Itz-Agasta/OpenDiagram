import { useEffect, useRef, type RefObject } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import type { ChatMessage } from "#/lib/types";
import type { CanvasDiagram } from "#/lib/utils/canvas-diagrams";
import { toPromptDiagrams } from "#/lib/utils/canvas-diagrams";
import {
  fetchDiagramChat,
  lastAssistantMessageIsCompleteWithAskUser,
  stripDrawDiagramOutput,
} from "#/lib/utils/diagram-chat";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

/** Outbound transcript window. The panel still holds the full thread. */
const LAST_MESSAGES = 10;

type UseDiagramChatSessionOptions = {
  fileId: string;
  diagramsRef: RefObject<CanvasDiagram[]>;
  modelId: string | null;
  providerId: string | null;
  persistTurn: (messages: UIMessage[]) => Promise<void>;
  onError?: (error: Error) => void;
};

/**
 * AI SDK session for one file.
 *
 * Canvas list and model pick are read through refs so a draw that lands
 * mid-turn is on the next request. `ask_user` is a client tool: after the
 * user answers, `sendAutomaticallyWhen` continues the turn. Completed turns
 * are appended to the thread in `onFinish`.
 */
export function useDiagramChatSession(options: UseDiagramChatSessionOptions) {
  const { fileId, diagramsRef, modelId, providerId, persistTurn, onError } = options;

  const modelIdRef = useRef(modelId);
  const providerIdRef = useRef(providerId);
  const persistTurnRef = useRef(persistTurn);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    modelIdRef.current = modelId;
    providerIdRef.current = providerId;
    persistTurnRef.current = persistTurn;
    onErrorRef.current = onError;
  }, [modelId, providerId, persistTurn, onError]);

  return useChat<ChatMessage>({
    id: fileId,
    transport: new DefaultChatTransport<ChatMessage>({
      api: `${SERVER_URL.replace(/\/$/, "")}/api/diagram/chat`,
      body: () => ({
        diagrams: toPromptDiagrams(diagramsRef.current ?? []),
        theme: "sketch",
        modelId: modelIdRef.current || undefined,
        providerId: providerIdRef.current || undefined,
      }),
      // Returning a body replaces the default, so id/trigger/messageId must
      // be forwarded. Skeletons stay in the UI; the server only needs summaries.
      // The model only needs recent turns; the canvas specs carry current state.
      prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
        body: {
          ...body,
          id,
          messages: stripDrawDiagramOutput(messages).slice(-LAST_MESSAGES),
          trigger,
          messageId,
        },
      }),
      fetch: fetchDiagramChat as typeof fetch,
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithAskUser,
    onFinish: ({ messages }) => {
      void persistTurnRef.current(messages);
    },
    onError: (error) => {
      onErrorRef.current?.(error);
    },
  });
}
