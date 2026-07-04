"use client";

import { useCallback, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ChatStatus } from "ai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  orchestrateWorkspaceRequest,
  runDiagramAgent,
  runProjectChatAgent,
  type WorkspaceAgentRoute,
} from "@/lib/workspace-agents";
import { updateProjectFile } from "@/lib/projects-client";
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
  projectId?: string;
  fileId?: string;
  initialHistory?: ChatMessage[];
}

export function AIChatPanel({
  excalidrawAPI,
  projectId,
  fileId,
  initialHistory,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory ?? []);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const idRef = useRef(initialHistory?.length ?? 0);

  const handleSubmit = useCallback(
    async (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      if (!text || status !== "ready") return;
      if (!projectId && !excalidrawAPI) return;

      setStatus("submitted");

      let route: WorkspaceAgentRoute;
      try {
        route = await orchestrateWorkspaceRequest({ text, projectId });
      } catch {
        route = { intent: "project_chat", pendingMessage: "Reading project context…" };
      }

      const userMessageId = `msg-${idRef.current++}`;
      const assistantMessageId = `msg-${idRef.current++}`;
      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: "user", text },
        {
          id: assistantMessageId,
          role: "assistant",
          text: route.pendingMessage,
        },
      ]);

      try {
        const result =
          route.intent === "diagram"
            ? await runDiagramAgent({ text, excalidrawAPI, projectId })
            : await runProjectChatAgent({ text, projectId });

        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === assistantMessageId ? { ...m, text: result.message } : m,
          );

          if (projectId && fileId) {
            setTimeout(() => {
              void updateProjectFile(projectId, fileId, {
                history: updated,
                spec: result.spec,
              });
            }, 0);
          }

          return updated;
        });
        setStatus("ready");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Diagram generation failed";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, text: `Error: ${message}` } : m)),
        );
        setStatus("ready");
      }
    },
    [excalidrawAPI, projectId, fileId, status],
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
              description={
                projectId
                  ? "Ask about this project's diagrams, docs, and workspace context."
                  : "Describe your architecture and I'll generate a diagram for you."
              }
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
              <p className="text-xs text-muted-foreground flex-1">
                {projectId ? "Project-grounded AI" : "Gemini 2.5 Flash"}
              </p>
              <PromptInputSubmit status={status} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}
