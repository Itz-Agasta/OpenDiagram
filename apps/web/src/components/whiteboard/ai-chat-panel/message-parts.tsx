import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Crosshair, Shapes } from "lucide-react";
import { isStaticToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import type { DiagramSpec } from "@OpenDiagram/harness";
import { drawnViews, type StoredAskUserInput } from "@/lib/chat-history";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { DotMatrixLoader } from "./DotMatrixLoader";

type Part = UIMessage["parts"][number];

export interface MessagePartHandlers {
  answerAskUser: (toolCallId: string, answer: string) => void;
  /** Scrolls the canvas to the diagram with this title. */
  showDiagram: (title: string) => void;
}

const isDrawPart = (part: Part) =>
  part.type === "tool-draw_diagram" ||
  part.type === "tool-draw_system" ||
  part.type === "data-drawn";

/**
 * One message's parts, with each run of consecutive draw parts collapsed into a
 * single step list. The `submitted` loader in the conversation disappears on
 * the stream's first chunk, which lands before the model has produced a word,
 * so an empty streaming message shows its own "Thinking" rather than nothing.
 */
export function MessageParts({
  message,
  isStreaming,
  handlers,
}: {
  message: UIMessage;
  isStreaming: boolean;
  handlers: MessagePartHandlers;
}) {
  const blocks: ReactNode[] = [];
  let run: Part[] = [];
  const flush = () => {
    if (run.length === 0) return;
    blocks.push(
      <DrawSteps
        key={`${message.id}-draw-${blocks.length}`}
        parts={run}
        showDiagram={handlers.showDiagram}
      />,
    );
    run = [];
  };

  message.parts.forEach((part, index) => {
    if (part.type === "step-start") return;
    if (isDrawPart(part)) {
      run.push(part);
      return;
    }
    flush();
    const block = renderPart(part, `${message.id}-${index}`, isStreaming, handlers);
    if (block) blocks.push(block);
  });
  flush();

  if (blocks.length > 0) return blocks;
  return isStreaming ? <Activity label="Thinking…" /> : null;
}

function renderPart(part: Part, key: string, isStreaming: boolean, handlers: MessagePartHandlers) {
  if (part.type === "text") {
    return part.text ? <MessageResponse key={key}>{part.text}</MessageResponse> : null;
  }
  if (part.type === "reasoning") {
    // Gemini on the platform key streams no reasoning text; BYOK models may.
    return part.text.trim() ? (
      <Reasoning key={key} isStreaming={isStreaming && part.state === "streaming"}>
        {part.text}
      </Reasoning>
    ) : null;
  }
  if (part.type === "tool-ask_user" && isStaticToolUIPart(part)) {
    return <AskUser key={key} part={part} handlers={handlers} />;
  }
  return null;
}

function AskUser({ part, handlers }: { part: ToolUIPart; handlers: MessagePartHandlers }) {
  if (part.state === "input-streaming") return <Activity label="Preparing a question…" />;
  if (part.state === "output-error") {
    return <p className="text-destructive text-xs">{part.errorText}</p>;
  }
  const input = part.input as StoredAskUserInput | undefined;
  if (!input?.question) return null;
  const answered = part.state === "output-available" ? (part.output as string) : null;

  return (
    <div className="space-y-2">
      <p className="text-sm">{input.question}</p>
      {answered === null ? (
        <Suggestions>
          {(input.options ?? []).map((option) => (
            <Suggestion
              key={option}
              suggestion={option}
              onClick={(answer) => handlers.answerAskUser(part.toolCallId, answer)}
            />
          ))}
        </Suggestions>
      ) : (
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <CheckCircle2 aria-hidden="true" className="size-3.5 text-primary" />
          {answered}
        </p>
      )}
    </div>
  );
}

/** A run of draw tool parts as one collapsible list, one step per drawn diagram. */
function DrawSteps({
  parts,
  showDiagram,
}: {
  parts: Part[];
  showDiagram: (title: string) => void;
}) {
  const drawn = parts.flatMap(drawnViews);
  const tools = parts.filter(isStaticToolUIPart);
  const active = tools.find(
    (part) => part.state === "input-streaming" || part.state === "input-available",
  );
  const failed = tools.flatMap((part) => (part.state === "output-error" ? [part.errorText] : []));
  const activeTitle =
    active?.type === "tool-draw_diagram"
      ? (active.input as Partial<DiagramSpec> | undefined)?.title
      : undefined;
  const activeLabel = active
    ? active.type === "tool-draw_system"
      ? "Modelling the system…"
      : activeTitle
        ? `Drawing “${activeTitle}”…`
        : "Drawing diagram…"
    : null;

  return (
    <ChainOfThought defaultOpen className="rounded-lg border border-od-border-soft px-3 py-2">
      <ChainOfThoughtHeader icon={Shapes}>
        {activeLabel ? (
          <Shimmer duration={1.5}>{activeLabel}</Shimmer>
        ) : drawn.length === 1 ? (
          "Drew 1 diagram"
        ) : (
          `Drew ${drawn.length} diagrams`
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {drawn.map((view, index) => (
          <ChainOfThoughtStep
            key={`${view.title}-${index}`}
            icon={CheckCircle2}
            label={
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-foreground">{view.title}</span>
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1 rounded px-1 text-muted-foreground hover:bg-od-surface hover:text-foreground"
                  onClick={() => showDiagram(view.title)}
                >
                  <Crosshair aria-hidden="true" className="size-3" />
                  Show
                </button>
              </span>
            }
            description={`${view.nodes} nodes, ${view.edges} edges`}
          />
        ))}
        {failed.map((errorText, index) => (
          <ChainOfThoughtStep
            key={`failed-${index}`}
            icon={CircleAlert}
            className="text-destructive"
            label={`Drawing failed: ${errorText}`}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

export function Activity({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 text-muted-foreground text-xs"
      role="status"
      aria-live="polite"
    >
      <DotMatrixLoader />
      <Shimmer>{label}</Shimmer>
    </div>
  );
}
