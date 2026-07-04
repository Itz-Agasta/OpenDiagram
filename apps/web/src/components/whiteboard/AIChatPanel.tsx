"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { UIMessage } from "ai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSpec, RenderSkeleton } from "@OpenDiagram/harness";
import { env } from "@OpenDiagram/env/web";
import { applyDiagramToCanvas } from "@/lib/excalidraw-utils";
import { Button } from "@/components/ui/button";
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

/** Mirror of the server's draw_diagram tool output (apps/server lib/agent/tools.ts). */
interface DrawDiagramOutput {
  skeletons: RenderSkeleton[];
  rawElements: unknown[];
  summary: { title: string; nodes: number; edges: number; warnings: string[] };
}

interface AskUserInput {
  question: string;
  options: string[];
}

interface AIChatPanelProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

/** The last assistant message's unanswered ask_user call, if any. */
function pendingAskUser(messages: UIMessage[]) {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return null;
  for (const part of last.parts) {
    if (part.type === "tool-ask_user" && part.state === "input-available") {
      return { toolCallId: part.toolCallId, input: part.input as AskUserInput };
    }
  }
  return null;
}

export function AIChatPanel({ excalidrawAPI }: AIChatPanelProps) {
  const currentSpecRef = useRef<DiagramSpec | undefined>(undefined);
  const frameByTitleRef = useRef(new Map<string, string>());
  const appliedToolCallsRef = useRef(new Set<string>());
  const [applyError, setApplyError] = useState<string | null>(null);

  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: `${env.NEXT_PUBLIC_SERVER_URL}/api/diagram/chat`,
      body: () => ({ currentSpec: currentSpecRef.current }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  // Apply each finished draw_diagram call to the canvas exactly once. If the
  // agent redraws a diagram it already drew (same title), the old frame is
  // replaced in place; otherwise the new frame lands beside existing content.
  useEffect(() => {
    if (!excalidrawAPI) return;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "tool-draw_diagram" || part.state !== "output-available") continue;
        if (appliedToolCallsRef.current.has(part.toolCallId)) continue;
        appliedToolCallsRef.current.add(part.toolCallId);

        const spec = part.input as DiagramSpec;
        const output = part.output as DrawDiagramOutput;
        currentSpecRef.current = spec;
        applyDiagramToCanvas(excalidrawAPI, output.skeletons, output.rawElements, {
          replaceFrameId: frameByTitleRef.current.get(spec.title) ?? null,
        })
          .then(({ frameId }) => {
            if (frameId) frameByTitleRef.current.set(spec.title, frameId);
          })
          .catch((err: unknown) => {
            setApplyError(err instanceof Error ? err.message : "Failed to draw on canvas");
          });
      }
    }
  }, [messages, excalidrawAPI]);

  const answerAskUser = useCallback(
    (toolCallId: string, answer: string) => {
      addToolOutput({ tool: "ask_user", toolCallId, output: answer });
    },
    [addToolOutput],
  );

  const handleSubmit = useCallback(
    (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      if (!text || !excalidrawAPI || (status !== "ready" && status !== "error")) return;
      setApplyError(null);
      // A typed reply while a question is pending answers the question.
      const pending = pendingAskUser(messages);
      if (pending) {
        answerAskUser(pending.toolCallId, text);
        return;
      }
      void sendMessage({ text });
    },
    [excalidrawAPI, status, messages, sendMessage, answerAskUser],
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
            messages.map((message) => (
              <Message key={message.id} from={message.role === "user" ? "user" : "assistant"}>
                <MessageContent>
                  {message.parts.map((part, i) => renderPart(message, part, i, answerAskUser))}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Thinking…
            </div>
          )}
          {status === "error" && (
            <p className="text-xs text-destructive">
              Something went wrong{error?.message ? ` — ${error.message}` : ""}. Try again.
            </p>
          )}
          {applyError && (
            <p className="text-xs text-destructive">Couldn't draw on canvas — {applyError}</p>
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

function renderPart(
  message: UIMessage,
  part: UIMessage["parts"][number],
  index: number,
  answerAskUser: (toolCallId: string, answer: string) => void,
) {
  const key = `${message.id}-${index}`;

  if (part.type === "text") {
    return part.text ? <MessageResponse key={key}>{part.text}</MessageResponse> : null;
  }

  if (part.type === "tool-ask_user") {
    const input = part.input as AskUserInput | undefined;
    if (!input?.question) return null;
    const answered = part.state === "output-available" ? (part.output as string) : null;
    return (
      <div key={key} className="space-y-2">
        <p className="text-sm">{input.question}</p>
        <div className="flex flex-wrap gap-1.5">
          {(input.options ?? []).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={answered === option ? "default" : "outline"}
              className="h-7 text-xs"
              disabled={answered !== null}
              onClick={() => answerAskUser(part.toolCallId, option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (part.type === "tool-draw_diagram") {
    const title = (part.input as Partial<DiagramSpec> | undefined)?.title;
    if (part.state === "output-available") {
      const summary = (part.output as DrawDiagramOutput).summary;
      return (
        <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-primary" />
          <span>
            {summary.title} — {summary.nodes} nodes, {summary.edges} edges
          </span>
        </div>
      );
    }
    if (part.state === "output-error") {
      return (
        <p key={key} className="text-xs text-destructive">
          Drawing failed: {part.errorText}
        </p>
      );
    }
    return (
      <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Drawing {title ? `“${title}”` : "diagram"}…
      </div>
    );
  }

  return null;
}
