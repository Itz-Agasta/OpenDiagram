"use client";

import { useCallback, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ChatStatus } from "ai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { generateDiagram } from "@/lib/diagram-client";
import { applyDiagramToCanvas } from "@/lib/excalidraw-utils";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface AIChatPanelProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export function AIChatPanel({ excalidrawAPI }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const idRef = useRef(0);

  const handleSubmit = useCallback(
    async (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      if (!text || !excalidrawAPI || status !== "ready") return;

      const userMessageId = `msg-${idRef.current++}`;
      const assistantMessageId = `msg-${idRef.current++}`;
      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: "user", text },
        { id: assistantMessageId, role: "assistant", text: "Generating diagram…" },
      ]);
      setStatus("submitted");

      try {
        const { spec, skeletons, rawElements } = await generateDiagram(text);
        await applyDiagramToCanvas(excalidrawAPI, skeletons, rawElements);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, text: `Done — "${spec.title}" (${spec.nodes.length} nodes).` }
              : m,
          ),
        );
        setStatus("ready");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Diagram generation failed";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, text: `Error: ${message}` } : m)),
        );
        setStatus("error");
      }
    },
    [excalidrawAPI, status],
  );

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">AI Assistant</span>
      </div>

      {/* Messages */}
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Describe your architecture and I'll generate a diagram for you."
              icon={<Sparkles className="size-6 text-muted-foreground" />}
            />
          ) : (
            messages.map((msg) => (
              <Message key={msg.id} from={msg.role}>
                <MessageContent>
                  <MessageResponse>{msg.text}</MessageResponse>
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input */}
      <div className="shrink-0 p-3 border-t border-border">
        <PromptInputProvider>
          <PromptInput onSubmit={handleSubmit} className="w-full">
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Describe your architecture…"
                className="min-h-40 max-h-40 resize-none"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <p className="text-xs text-muted-foreground flex-1">Gemini 2.5 Flash</p>
              <PromptInputSubmit status={status} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}
