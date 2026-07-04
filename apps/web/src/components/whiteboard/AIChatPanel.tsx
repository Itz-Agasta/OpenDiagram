"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Circle, CircleAlert, Sparkles } from "lucide-react";
import type { ChatStatus } from "ai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  orchestrateWorkspaceRequest,
  runDiagramAgent,
  runProjectChatAgent,
  type WorkspaceAgentId,
  type WorkspaceAgentProgress,
  type WorkspaceAgentRoute,
} from "@/lib/workspace-agents";
import { updateProjectFile } from "@/lib/projects-client";
import { cn } from "@/lib/utils";
import { Diamond } from "@/components/loading-ui/diamond";
import { MorphingInfinity } from "@/components/loading-ui/morphing-infinity";
import { SquareSnake } from "@/components/loading-ui/square-snake";
import { TextDots } from "@/components/loading-ui/text-dots";
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

type AgentStepStatus = "pending" | "active" | "complete" | "failed";

type AgentStep = {
  id: WorkspaceAgentId;
  label: string;
  detail: string;
  status: AgentStepStatus;
};

type LoaderKind = "diamond" | "infinity" | "snake";

type AgentRun = {
  id: string;
  intent?: WorkspaceAgentRoute["intent"];
  loader: LoaderKind;
  activeMessage: string;
  steps: AgentStep[];
};

interface AIChatPanelProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  projectId?: string;
  fileId?: string;
  initialHistory?: ChatMessage[];
}

const loaderKinds: LoaderKind[] = ["diamond", "infinity", "snake"];

const agentLabels: Record<WorkspaceAgentId, string> = {
  router: "Router",
  memory: "Cognee Agent",
  diagram: "Diagram Agent",
  canvas: "Canvas Agent",
  answer: "Answer Agent",
};

const agentStatusCopy: Record<WorkspaceAgentId, string[]> = {
  router: [
    "Routing the request",
    "Choosing the right workspace agent",
    "Reading intent from your prompt",
  ],
  memory: [
    "Reading project memory",
    "Checking Cognee context",
    "Looking through architecture notes",
    "Finding relevant workspace details",
  ],
  diagram: [
    "Sketching service boundaries",
    "Drafting diagram structure",
    "Resolving architecture nodes",
    "Planning the canvas layout",
  ],
  canvas: [
    "Applying changes to canvas",
    "Positioning diagram shapes",
    "Updating Excalidraw elements",
  ],
  answer: ["Composing a grounded answer", "Summarizing findings", "Preparing the response"],
};

function createSteps(intent?: WorkspaceAgentRoute["intent"], hasProject = false): AgentStep[] {
  const ids: WorkspaceAgentId[] = ["router"];

  if (intent === "diagram") {
    if (hasProject) ids.push("memory");
    ids.push("diagram", "canvas");
  } else if (intent === "project_chat") {
    ids.push("memory", "answer");
  }

  return ids.map((id, index) => ({
    id,
    label: agentLabels[id],
    detail: index === 0 ? "Waiting" : "Queued",
    status: index === 0 ? "active" : "pending",
  }));
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function randomStatus(agent: WorkspaceAgentId) {
  return randomItem(agentStatusCopy[agent]);
}

function randomLoader() {
  return randomItem(loaderKinds);
}

export function AIChatPanel({
  excalidrawAPI,
  projectId,
  fileId,
  initialHistory,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory ?? []);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const idRef = useRef(initialHistory?.length ?? 0);

  useEffect(() => {
    if (!agentRun) return;

    const activeStep = agentRun.steps.find((step) => step.status === "active");
    if (!activeStep) return;

    const timer = window.setInterval(() => {
      setAgentRun((current) => {
        if (!current) return current;
        const nextActiveStep = current.steps.find((step) => step.status === "active");
        if (!nextActiveStep) return current;
        return {
          ...current,
          activeMessage: randomStatus(nextActiveStep.id),
        };
      });
    }, 1800);

    return () => window.clearInterval(timer);
  }, [agentRun]);

  const updateAgentProgress = useCallback((event: WorkspaceAgentProgress) => {
    setAgentRun((current) => {
      if (!current) return current;

      return {
        ...current,
        loader: event.status === "active" ? randomLoader() : current.loader,
        activeMessage:
          event.status === "active"
            ? (event.message ?? randomStatus(event.agent))
            : current.activeMessage,
        steps: current.steps.map((step) => {
          if (step.id !== event.agent) return step;

          return {
            ...step,
            detail: event.message ?? step.detail,
            status: event.status,
          };
        }),
      };
    });
  }, []);

  const handleSubmit = useCallback(
    async (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      if (!text || status !== "ready") return;
      if (!projectId && !excalidrawAPI) return;

      setStatus("submitted");
      setAgentRun({
        id: `run-${Date.now()}`,
        loader: randomLoader(),
        activeMessage: randomStatus("router"),
        steps: createSteps(undefined, Boolean(projectId)),
      });

      let route: WorkspaceAgentRoute;
      try {
        route = await orchestrateWorkspaceRequest({ text, projectId });
        setAgentRun((current) =>
          current
            ? {
                ...current,
                intent: route.intent,
                activeMessage:
                  route.intent === "diagram" ? randomStatus("diagram") : randomStatus("memory"),
                steps: createSteps(route.intent, Boolean(projectId)).map((step) =>
                  step.id === "router"
                    ? {
                        ...step,
                        detail: `Routed to ${route.intent === "diagram" ? "Diagram" : "Cognee"} Agent`,
                        status: "complete",
                      }
                    : step,
                ),
              }
            : current,
        );
      } catch {
        route = { intent: "project_chat", pendingMessage: "Reading project context…" };
        setAgentRun((current) =>
          current
            ? {
                ...current,
                intent: route.intent,
                activeMessage: randomStatus("memory"),
                steps: createSteps(route.intent, Boolean(projectId)).map((step) =>
                  step.id === "router"
                    ? { ...step, detail: "Used default project chat route", status: "complete" }
                    : step,
                ),
              }
            : current,
        );
      }

      const userMessageId = `msg-${idRef.current++}`;
      setMessages((prev) => [...prev, { id: userMessageId, role: "user", text }]);

      try {
        const result =
          route.intent === "diagram"
            ? await runDiagramAgent({
                text,
                excalidrawAPI,
                projectId,
                onProgress: updateAgentProgress,
              })
            : await runProjectChatAgent({ text, projectId, onProgress: updateAgentProgress });

        setMessages((prev) => {
          const updated = [
            ...prev,
            { id: `msg-${idRef.current++}`, role: "assistant" as const, text: result.message },
          ];

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
        setAgentRun((current) =>
          current
            ? {
                ...current,
                activeMessage: "Done",
                steps: current.steps.map((step) =>
                  step.status === "active"
                    ? { ...step, status: "complete", detail: "Complete" }
                    : step,
                ),
              }
            : current,
        );
        setStatus("ready");
        window.setTimeout(() => setAgentRun(null), 1200);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Diagram generation failed";
        setAgentRun((current) =>
          current
            ? {
                ...current,
                activeMessage: message,
                steps: current.steps.map((step) =>
                  step.status === "active" ? { ...step, status: "failed", detail: message } : step,
                ),
              }
            : current,
        );
        setMessages((prev) => [
          ...prev,
          { id: `msg-${idRef.current++}`, role: "assistant", text: `Error: ${message}` },
        ]);
        setStatus("ready");
      }
    },
    [excalidrawAPI, projectId, fileId, status, updateAgentProgress],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col border-l border-od-border-soft bg-white text-od-ink">
      <div className="shrink-0 border-b border-od-border-soft bg-[radial-gradient(circle_at_top_left,rgba(232,229,216,0.9),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,249,245,0.9))] px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold leading-none">Picasso</p>
          <p className="mt-1 truncate text-[11px] text-od-ink-faint">OpenDiagram agent</p>
        </div>
      </div>

      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="flex flex-col gap-4 px-4 py-4">
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
          {agentRun && <AgentRunCard run={agentRun} />}
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
              <p className="flex-1 text-xs text-od-ink-faint">
                {agentRun ? (
                  <TextDots>{agentRun.activeMessage}</TextDots>
                ) : (
                  "Router + memory + diagram agents"
                )}
              </p>
              <PromptInputSubmit status={status} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}

function AgentRunCard({ run }: { run: AgentRun }) {
  const activeStep = run.steps.find((step) => step.status === "active");

  return (
    <div className="rounded-[16px] border border-od-border-soft bg-od-surface p-3 shadow-[0_18px_80px_-58px_rgba(24,24,21,0.4)]">
      <div className="flex items-center justify-between gap-3 border-b border-od-border-soft pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 place-items-center text-od-ink">
            <RandomLoader kind={run.loader} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-od-ink">
              {activeStep?.label ?? "Agent run"}
            </p>
            <p className="mt-1 truncate text-[11px] text-od-ink-faint">
              <TextDots>{run.activeMessage}</TextDots>
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-od-border-soft bg-white px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-od-ink-faint">
          {run.intent === "diagram" ? "draw" : "ask"}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {run.steps.map((step) => (
          <AgentStepRow key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

function AgentStepRow({ step }: { step: AgentStep }) {
  return (
    <div className="grid grid-cols-[20px_1fr] items-start gap-2 text-[12px]">
      <span className="mt-0.5 grid size-5 place-items-center text-od-ink-faint">
        {step.status === "complete" && <Check className="size-3.5 text-od-green" />}
        {step.status === "failed" && <CircleAlert className="size-3.5 text-red-600" />}
        {step.status === "active" && (
          <Circle className="size-2.5 animate-pulse fill-od-ink text-od-ink" />
        )}
        {step.status === "pending" && <Circle className="size-2.5 text-od-border-strong" />}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-medium",
            step.status === "pending" ? "text-od-ink-faint" : "text-od-ink",
          )}
        >
          {step.label}
        </span>
        <span className="mt-0.5 block truncate text-[11px] italic text-black/50">
          {step.detail}
        </span>
      </span>
    </div>
  );
}

function RandomLoader({ kind }: { kind: LoaderKind }) {
  if (kind === "diamond") return <Diamond className="size-5" />;
  if (kind === "infinity") return <MorphingInfinity className="size-5" />;
  return <SquareSnake className="text-[5px]" size={4} />;
}
