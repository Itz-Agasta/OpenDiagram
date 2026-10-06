import { useState } from "react";
import { Check, CheckCircle2, Copy, Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { ChatStatus, UIMessage } from "ai";
import { uiMessageText } from "@/lib/chat-history";
import type { RepoGenerationJob } from "@/lib/projects-client";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import { MessageParts } from "./message-parts";

interface AIChatConversationProps {
  answerAskUser: (toolCallId: string, answer: string) => void;
  applyError: string | null;
  /** Re-runs a failed diagram turn. Absent where a turn cannot be retried (doc chat). */
  onRetry?: () => void;
  diagramError?: Error;
  diagramStatus: ChatStatus;
  messages: UIMessage[];
  projectError: string | null;
  projectId?: string;
  projectStatus: ChatStatus;
  repoGenerationError: string | null;
  repoGenerationJob: RepoGenerationJob | null;
  showDiagram: (title: string) => void;
}

export function AIChatConversation(props: AIChatConversationProps) {
  const {
    answerAskUser,
    applyError,
    diagramError,
    diagramStatus,
    messages,
    onRetry,
    projectError,
    projectId,
    projectStatus,
    repoGenerationError,
    repoGenerationJob,
    showDiagram,
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
            const text = message.role === "assistant" ? uiMessageText(message) : "";

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
                  <MessageParts
                    handlers={{ answerAskUser, showDiagram }}
                    isStreaming={isCurrentAgentOutput}
                    message={message}
                  />
                </MessageContent>
                {text && !isCurrentAgentOutput && (
                  <MessageActions className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <CopyAction text={text} />
                  </MessageActions>
                )}
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
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <span className="min-w-0 flex-1">
              {diagramError?.message ?? "Something went wrong. Try again."}
            </span>
            {onRetry && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
                <RotateCcw className="size-3.5" />
                Retry
              </Button>
            )}
          </div>
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

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <MessageAction
      label="Copy"
      tooltip={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </MessageAction>
  );
}
