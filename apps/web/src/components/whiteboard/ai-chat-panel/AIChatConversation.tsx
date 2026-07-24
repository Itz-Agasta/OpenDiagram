import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { ChatStatus, UIMessage } from "ai";
import type { DiagramSpec } from "@OpenDiagram/harness";
import type { StoredAskUserInput } from "@/lib/chat-history";
import type { RepoGenerationJob } from "@/lib/projects-client";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type { DrawDiagramOutput } from "./types";
import { DotMatrixLoader } from "./DotMatrixLoader";

interface AIChatConversationProps {
  answerAskUser: (toolCallId: string, answer: string) => void;
  applyError: string | null;
  diagramError?: Error;
  diagramStatus: ChatStatus;
  messages: UIMessage[];
  projectError: string | null;
  projectId?: string;
  projectStatus: ChatStatus;
  repoGenerationError: string | null;
  repoGenerationJob: RepoGenerationJob | null;
}

export function AIChatConversation(props: AIChatConversationProps) {
  const {
    answerAskUser,
    applyError,
    diagramError,
    diagramStatus,
    messages,
    projectError,
    projectId,
    projectStatus,
    repoGenerationError,
    repoGenerationJob,
  } = props;
  const messagesEmpty = messages.length === 0;

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="flex flex-col gap-4 px-4 py-4">
        <RepoGenerationProgress error={repoGenerationError} job={repoGenerationJob} />
        {messagesEmpty ? (
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
          messages.map((message, index) => {
            const isCurrentAgentOutput =
              message.role === "assistant" &&
              index === messages.length - 1 &&
              (diagramStatus === "streaming" || projectStatus === "streaming");

            return (
              <Message
                key={message.id}
                from={message.role === "user" ? "user" : "assistant"}
                className={
                  message.role === "assistant"
                    ? isCurrentAgentOutput
                      ? "od-ai-output-streaming"
                      : "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
                    : undefined
                }
              >
                <MessageContent>
                  {message.parts.map((part, partIndex) =>
                    renderMessagePart(message, part, partIndex, answerAskUser),
                  )}
                </MessageContent>
              </Message>
            );
          })
        )}
        {(diagramStatus === "submitted" || projectStatus === "submitted") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {projectStatus === "submitted" ? "Reading project memory…" : "Preparing your diagram…"}
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
              <span className={`size-1.5 rounded-full ${taskDotColor(task.status)}`} />
              <span className="min-w-0 flex-1 truncate">{task.name}</span>
              <span className="shrink-0 text-od-ink-faint">{task.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function taskDotColor(status: RepoGenerationJob["tasks"][number]["status"]) {
  if (status === "complete") return "bg-od-green";
  if (status === "active") return "bg-od-ink";
  if (status === "failed") return "bg-red-500";
  return "bg-od-border-soft";
}

function renderMessagePart(
  message: UIMessage,
  part: UIMessage["parts"][number],
  index: number,
  answerAskUser: (toolCallId: string, answer: string) => void,
) {
  const key = `${message.id}-${index}`;
  if (part.type === "text") {
    return part.text ? <MessageResponse key={key}>{part.text}</MessageResponse> : null;
  }

  if (part.type === "reasoning") {
    return null;
  }

  if (part.type === "tool-ask_user") {
    if (part.state === "input-streaming") {
      return <ToolActivity key={key} label="Preparing a question…" />;
    }
    if (part.state === "output-error") {
      return (
        <p key={key} className="text-xs text-destructive">
          {part.errorText}
        </p>
      );
    }
    const input = part.input as StoredAskUserInput | undefined;
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

  if (part.type !== "tool-draw_diagram") return null;
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
  return <ToolActivity key={key} label={title ? `Drawing “${title}”…` : "Drawing diagram…"} />;
}

function ToolActivity({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <DotMatrixLoader />
      <span>{label}</span>
    </div>
  );
}
