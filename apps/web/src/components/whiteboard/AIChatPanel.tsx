"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles } from "lucide-react";
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

export function AIChatPanel() {
  const [messages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const _idRef = useRef(0);

  // Phase 1: UI only — submit disabled, no backend wired yet
  const handleSubmit = useCallback((_msg: PromptInputMessage) => {
    // Intentionally no-op until Phase 3 backend is wired
  }, []);

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">AI Assistant</span>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          Phase 1
        </span>
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
                value={input}
                placeholder="Describe your architecture… (AI coming soon)"
                onChange={(e) => setInput(e.currentTarget.value)}
                className="min-h-40 max-h-40 resize-none"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <p className="text-xs text-muted-foreground flex-1">AI backend wired in Phase 3</p>
              <PromptInputSubmit status="ready" disabled />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}
