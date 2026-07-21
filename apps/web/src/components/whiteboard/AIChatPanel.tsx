"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { ChatStatus, UIMessage } from "ai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { env } from "@OpenDiagram/env/web";
import type { DiagramSpec, RenderSkeleton, ThemeName } from "@OpenDiagram/harness";
import { applyDiagramToCanvas } from "@/lib/excalidraw-utils";
import { orchestrateWorkspaceRequest, runProjectChatAgent } from "@/lib/workspace-agents";
import {
  CreationQuotaError,
  updateProjectFile,
  type CreationQuota,
  type RepoGenerationJob,
} from "@/lib/projects-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  activeFileType?: "diagram" | "doc";
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  projectId?: string;
  fileId?: string;
  initialHistory?: ChatMessage[];
  hasExistingScene?: boolean;
  repoGenerationJob?: RepoGenerationJob | null;
  repoGenerationError?: string | null;
  onQuotaError?: (message: string) => void;
}

function chatMessageToUIMessage(message: ChatMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.text }],
  };
}

function uiMessageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function uiMessagesToChatHistory(messages: UIMessage[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const text = uiMessageText(message);
    return text ? [{ id: message.id, role: message.role, text }] : [];
  });
}

async function fetchDiagramChat(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { ...init, credentials: "include" });
  if (response.ok) return response;

  const data = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    quota?: CreationQuota;
  } | null;
  const message = data?.error ?? "The diagram agent is unavailable. Try again.";

  if (data?.code === "creation_quota_exceeded") {
    throw new CreationQuotaError(message, data.quota);
  }

  throw new Error(message);
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

/** One-click starter prompts — each exercises a different diagram type. */
const DIAGRAM_TEMPLATES: { label: string; prompt: string }[] = [
  {
    label: "Microservices on AWS",
    prompt:
      "Design a microservices architecture for an e-commerce platform on AWS: client → API gateway → core services (orders, products, users) → databases, cache and an SQS event queue. Everything except the client sits inside a VPC, with the services in their own cluster.",
  },
  {
    label: "CI/CD pipeline",
    prompt:
      "Draw a CI/CD pipeline: developer pushes to GitHub, CI runs tests and builds a Docker image, the image is pushed to a registry, then deployed to Kubernetes staging and production.",
  },
  {
    label: "Login sequence",
    prompt:
      "Draw a sequence diagram of an OAuth login flow with browser, web app, auth service and database — include token validation and the reply messages.",
  },
  {
    label: "E-commerce ERD",
    prompt:
      "Draw an ERD for an e-commerce database: users, orders, order_items, products and payments tables with their key columns and foreign-key relationships.",
  },
  {
    label: "RAG pipeline",
    prompt:
      "Diagram a RAG pipeline: documents get chunked and embedded into a vector database; at query time the app retrieves context and calls an LLM to answer.",
  },
];

function diagramRequestLikely(text: string) {
  return /\b(diagram|flowchart|sequence|architecture|system flow|request flow|data flow|canvas|whiteboard|draw|sketch|map)\b/i.test(
    text,
  );
}

export function AIChatPanel({
  activeFileType,
  excalidrawAPI,
  projectId,
  fileId,
  initialHistory,
  hasExistingScene,
  repoGenerationJob,
  repoGenerationError,
  onQuotaError,
}: AIChatPanelProps) {
  const currentSpecRef = useRef<DiagramSpec | undefined>(undefined);
  const frameByTitleRef = useRef(new Map<string, string>());
  const appliedToolCallsRef = useRef(new Set<string>());
  // Serializes canvas applies: each one reads and rewrites the whole scene, so
  // two in flight at once would clobber each other's elements.
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());
  const initialDiagramMessages =
    activeFileType === "diagram" ? (initialHistory ?? []).map(chatMessageToUIMessage) : [];
  const initialDiagramPrompt =
    activeFileType === "diagram"
      ? (initialHistory ?? []).find((message) => message.role === "user")
      : undefined;
  const messageIdRef = useRef(initialHistory?.length ?? 0);
  const [projectMessages, setProjectMessages] = useState<ChatMessage[]>(
    activeFileType === "diagram" ? [] : (initialHistory ?? []),
  );
  const [projectStatus, setProjectStatus] = useState<ChatStatus>("ready");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [themeName, setThemeName] = useState<ThemeName>("sketch");
  // Ref mirror so the transport's body() closure always reads the live value.
  const themeRef = useRef<ThemeName>(themeName);
  themeRef.current = themeName;
  const [applyError, setApplyError] = useState<string | null>(null);

  const {
    messages: diagramMessages,
    sendMessage,
    addToolOutput,
    status: diagramStatus,
    error: diagramError,
  } = useChat({
    messages: initialDiagramMessages,
    transport: new DefaultChatTransport({
      api: `${env.NEXT_PUBLIC_SERVER_URL}/api/diagram/chat`,
      body: () => ({ currentSpec: currentSpecRef.current, theme: themeRef.current }),
      fetch: fetchDiagramChat,
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ messages }) => {
      if (!projectId || !fileId) return;
      void updateProjectFile(projectId, fileId, { history: uiMessagesToChatHistory(messages) });
    },
  });

  useEffect(() => {
    const hasAssistant = diagramMessages.some((message) => message.role === "assistant");
    if (!initialDiagramPrompt || !excalidrawAPI || hasAssistant || hasExistingScene) return;

    const key = `opendiagram:auto-diagram:${projectId ?? "guest"}:${fileId ?? "file"}:${initialDiagramPrompt.id}`;
    if (window.sessionStorage.getItem(key)) return;

    window.sessionStorage.setItem(key, "1");
    const seedMessage = diagramMessages.find(
      (message) => message.role === "user" && uiMessageText(message) === initialDiagramPrompt.text,
    );
    void sendMessage(
      seedMessage
        ? { text: initialDiagramPrompt.text, messageId: seedMessage.id }
        : { text: initialDiagramPrompt.text },
    );
  }, [
    diagramMessages,
    excalidrawAPI,
    fileId,
    hasExistingScene,
    initialDiagramPrompt,
    projectId,
    sendMessage,
  ]);

  useEffect(() => {
    if (!(diagramError instanceof CreationQuotaError)) return;
    onQuotaError?.(diagramError.message);
  }, [diagramError, onQuotaError]);

  // Apply each finished draw_diagram call to the canvas exactly once. If the
  // agent redraws a diagram it already drew (same title), the old frame is
  // replaced in place; otherwise the new frame lands beside existing content.
  useEffect(() => {
    if (!excalidrawAPI) return;
    for (const message of diagramMessages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "tool-draw_diagram" || part.state !== "output-available") continue;
        if (appliedToolCallsRef.current.has(part.toolCallId)) continue;
        appliedToolCallsRef.current.add(part.toolCallId);

        const spec = part.input as DiagramSpec;
        const output = part.output as DrawDiagramOutput;
        const toolCallId = part.toolCallId;
        currentSpecRef.current = spec;
        applyChainRef.current = applyChainRef.current.then(() =>
          // replaceFrameId is resolved inside the chain so it sees frame ids
          // recorded by the apply that ran just before this one.
          applyDiagramToCanvas(excalidrawAPI, output.skeletons, output.rawElements, {
            replaceFrameId: frameByTitleRef.current.get(spec.title) ?? null,
          })
            .then(({ frameId }) => {
              if (frameId) frameByTitleRef.current.set(spec.title, frameId);
            })
            .catch((err: unknown) => {
              // Un-mark so the next messages update can retry after a
              // transient failure instead of dropping the diagram forever.
              appliedToolCallsRef.current.delete(toolCallId);
              setApplyError(err instanceof Error ? err.message : "Failed to draw on canvas");
            }),
        );
      }
    }
  }, [diagramMessages, excalidrawAPI]);

  const answerAskUser = useCallback(
    (toolCallId: string, answer: string) => {
      addToolOutput({ tool: "ask_user", toolCallId, output: answer });
    },
    [addToolOutput],
  );

  const runProjectChat = useCallback(
    async (text: string) => {
      if (!projectId) return false;

      const userMessage: ChatMessage = {
        id: `msg-${messageIdRef.current++}`,
        role: "user",
        text,
      };
      setProjectMessages((prev) => [...prev, userMessage]);
      setProjectStatus("submitted");
      setProjectError(null);

      try {
        const result = await runProjectChatAgent({ text, projectId });
        setProjectMessages((prev) => {
          const updated = [
            ...prev,
            {
              id: `msg-${messageIdRef.current++}`,
              role: "assistant" as const,
              text: result.message,
            },
          ];

          if (fileId) {
            window.setTimeout(() => {
              void updateProjectFile(projectId, fileId, { history: updated });
            }, 0);
          }

          return updated;
        });
        setProjectStatus("ready");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Project chat failed";
        if (err instanceof CreationQuotaError) onQuotaError?.(message);
        setProjectMessages((prev) => [
          ...prev,
          { id: `msg-${messageIdRef.current++}`, role: "assistant", text: `Error: ${message}` },
        ]);
        setProjectError(message);
        setProjectStatus("ready");
      }

      return true;
    },
    [fileId, onQuotaError, projectId],
  );

  const handleSubmit = useCallback(
    async (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      const status = projectStatus !== "ready" ? projectStatus : diagramStatus;
      if (!text || (status !== "ready" && status !== "error")) return;

      setApplyError(null);
      const pending = pendingAskUser(diagramMessages);
      if (pending) {
        answerAskUser(pending.toolCallId, text);
        return;
      }

      let useProjectChat = Boolean(projectId) && !diagramRequestLikely(text);
      if (projectId && excalidrawAPI) {
        try {
          const route = await orchestrateWorkspaceRequest({ text, projectId });
          useProjectChat = route.intent === "project_chat";
        } catch {
          useProjectChat = !diagramRequestLikely(text);
        }
      }

      if (useProjectChat) {
        await runProjectChat(text);
        return;
      }

      if (!excalidrawAPI) {
        await runProjectChat(text);
        return;
      }

      void sendMessage({ text });
    },
    [
      answerAskUser,
      diagramMessages,
      diagramStatus,
      excalidrawAPI,
      projectId,
      projectStatus,
      runProjectChat,
      sendMessage,
    ],
  );

  const messagesEmpty = projectMessages.length === 0 && diagramMessages.length === 0;
  const submitStatus = projectStatus !== "ready" ? projectStatus : diagramStatus;

  return (
    <div className="flex min-h-0 flex-1 flex-col border-l border-od-border-soft bg-white text-od-ink">
      <div className="shrink-0 border-b border-od-border-soft bg-[radial-gradient(circle_at_top_left,rgba(232,229,216,0.9),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,249,245,0.9))] px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold leading-none">Picasso</p>
          <p className="mt-1 truncate text-[11px] text-od-ink-faint">OpenDiagram agent</p>
        </div>
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="flex flex-col gap-4 px-4 py-4">
          <RepoGenerationProgress
            error={repoGenerationError ?? null}
            job={repoGenerationJob ?? null}
          />
          {messagesEmpty ? (
            <div className="flex flex-col">
              <ConversationEmptyState
                title="Start a conversation"
                description={
                  projectId
                    ? "Ask about this project's diagrams, docs, and workspace context."
                    : "Describe your architecture and I'll generate a diagram for you."
                }
                icon={<Sparkles className="size-6 text-muted-foreground" />}
              />
              {excalidrawAPI && (
                <div className="flex flex-wrap justify-center gap-1.5 px-2 pb-4">
                  {DIAGRAM_TEMPLATES.map((template) => (
                    <Button
                      key={template.label}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={submitStatus !== "ready"}
                      onClick={() => {
                        setApplyError(null);
                        void sendMessage({ text: template.prompt });
                      }}
                    >
                      {template.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {projectMessages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    <MessageResponse>{message.text}</MessageResponse>
                  </MessageContent>
                </Message>
              ))}
              {diagramMessages.map((message) => (
                <Message key={message.id} from={message.role === "user" ? "user" : "assistant"}>
                  <MessageContent>
                    {message.parts.map((part, i) => renderPart(message, part, i, answerAskUser))}
                  </MessageContent>
                </Message>
              ))}
            </>
          )}
          {(diagramStatus === "submitted" || projectStatus === "submitted") && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {projectStatus === "submitted" ? "Reading project memory…" : "Thinking…"}
            </div>
          )}
          {diagramStatus === "error" && (
            <p className="text-xs text-destructive">
              {diagramError?.message ?? "Something went wrong. Try again."}
            </p>
          )}
          {projectError && <p className="text-xs text-destructive">{projectError}</p>}
          {applyError && (
            <p className="text-xs text-destructive">Couldn't draw on canvas — {applyError}</p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-od-border-soft bg-od-surface p-3">
        <PromptInputProvider>
          <PromptInput
            onSubmit={handleSubmit}
            className="w-full border-od-border-soft bg-white text-od-ink shadow-[0_18px_80px_-56px_rgba(24,24,21,0.35)]"
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask, plan, or generate a diagram…"
                className="min-h-32 max-h-40 resize-none text-od-ink placeholder:text-od-ink-faint"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <Select value={themeName} onValueChange={(v) => setThemeName(v as ThemeName)}>
                <SelectTrigger className="h-7 w-30 text-xs" aria-label="Diagram theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sketch">Sketch</SelectItem>
                  <SelectItem value="classic">Classic</SelectItem>
                </SelectContent>
              </Select>
              <p className="flex-1 pr-2 text-right text-xs text-od-ink-faint">
                {projectStatus === "submitted" ? "Reading project memory" : "Gemini 2.5 Flash"}
              </p>
              <PromptInputSubmit status={submitStatus} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}

function RepoGenerationProgress({
  error,
  job,
}: {
  error: string | null;
  job: RepoGenerationJob | null;
}) {
  if (!job && !error) return null;

  const activeTask = job?.tasks.find((task) => task.status === "active");

  return (
    <div className="mb-2 rounded-[12px] border border-od-border-soft bg-white p-3 shadow-[0_12px_36px_-28px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2">
        {job?.status === "done" ? (
          <CheckCircle2 className="size-5 text-od-green" />
        ) : error || job?.status === "failed" ? (
          <span className="grid size-5 place-items-center rounded-full bg-red-50 text-[11px] font-semibold text-red-600">
            !
          </span>
        ) : (
          <Loader2 className="size-5 animate-spin text-od-ink" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-od-ink">
            {error ?? job?.message ?? "Generating repository files"}
          </p>
          {job && job.status !== "done" && job.status !== "failed" && (
            <p className="text-[11px] text-od-ink-faint">
              {activeTask?.message ?? "Preparing agents"}
            </p>
          )}
        </div>
      </div>

      {job?.tasks.length ? (
        <div className="mt-3 grid gap-1.5">
          {job.tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 text-[11px] text-od-ink-muted">
              <span
                className={`size-1.5 rounded-full ${
                  task.status === "complete"
                    ? "bg-od-green"
                    : task.status === "active"
                      ? "bg-od-ink"
                      : task.status === "failed"
                        ? "bg-red-500"
                        : "bg-od-border-soft"
                }`}
              />
              <span className="min-w-0 flex-1 truncate">{task.name}</span>
              <span className="shrink-0 text-od-ink-faint">{task.status}</span>
            </div>
          ))}
        </div>
      ) : null}
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
