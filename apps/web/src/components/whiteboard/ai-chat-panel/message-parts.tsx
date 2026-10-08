import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Crosshair, Shapes } from "lucide-react";
import { isStaticToolUIPart, type FileUIPart, type ToolUIPart, type UIMessage } from "ai";
import type { DiagramSpec } from "@OpenDiagram/harness";
import { drawnViews, type StoredAskUserInput } from "@/lib/chat-history";
import { fileUIPartText, isTextFilePart } from "@/lib/pasted-text";
import { Attachment, Attachments } from "@/components/ai-elements/attachments";
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
import { PastedTextDialog } from "./PastedTextDialog";

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

  const files = message.parts.filter(isTextFilePart);
  if (files.length > 0) blocks.push(<PastedFiles key={`${message.id}-files`} files={files} />);

  message.parts.forEach((part, index) => {
    if (part.type === "step-start" || part.type === "file") return;
    if (part.type === "text" && message.role === "user") {
      if (part.text) blocks.push(<UserText key={`${message.id}-${index}`} text={part.text} />);
      return;
    }
    if (isDrawPart(part)) {
      run.push(part);
      return;
    }
    flush();
    const block = renderPart(part, `${message.id}-${index}`, isStreaming, handlers);
    if (block) blocks.push(block);
  });
  flush();

  // Changes on every streamed character and every new part.
  const progress = `${message.parts.length}:${message.parts.reduce(
    (total, part) => total + ("text" in part ? part.text.length : 0),
    0,
  )}`;
  const stalled = useStalled(progress, isStreaming);

  if (!isStreaming) return blocks.length > 0 ? blocks : null;
  const pending = pendingLabel(message.parts);
  if (blocks.length === 0) return <Activity label={pending ?? "Thinking…"} />;
  const last = message.parts.findLast((part) => part.type !== "step-start");
  // Under text it waits for a stall: while words are still arriving they are
  // the progress, and a line under them reads as a second, competing loader.
  const textIsLast = last?.type === "text" || last?.type === "reasoning";
  if (pending && (stalled || !textIsLast)) {
    blocks.push(<Activity key={`${message.id}-pending`} label={pending} />);
  }
  return blocks;
}

/** Below this, a pause between streamed chunks is just network jitter. */
const STALL_MS = 1_200;

/** True once `progress` has not changed for STALL_MS while `active`. */
function useStalled(progress: string, active: boolean) {
  const [stalledAt, setStalledAt] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setStalledAt(progress), STALL_MS);
    return () => clearTimeout(timer);
  }, [progress, active]);
  return active && stalledAt === progress;
}

/**
 * What to show at the end of a streaming message whose last part is not
 * already showing progress. Gemini sends a tool call's arguments in one piece,
 * so while it writes a large draw_system spec the message has no new part at
 * all, and without this the panel sat still for 10-30s and read as stalled.
 *
 * A rejected call (invalid input) comes back as a `dynamic-tool` part, which
 * renders as nothing: the SDK re-tags invalid calls `dynamic: true`
 * (ai 7.0.40, dist/index.js 3855). The model retries after it, so it is named
 * here rather than shown as a failure.
 */
function pendingLabel(parts: Part[]) {
  const last = parts.findLast((part) => part.type !== "step-start");
  if (!last) return "Thinking…";
  // Not keyed on a text part's `state`: with Gemini it stays "streaming" until
  // the step ends, through the whole wait for the tool call (measured: 18s at a
  // fixed length), so the caller times the stall instead (`useStalled`).
  if (last.type === "dynamic-tool" && last.state === "output-error") return "Fixing the diagram…";
  if (
    isStaticToolUIPart(last) &&
    last.state !== "output-available" &&
    last.state !== "output-error"
  ) {
    // Draw steps and ask_user render their own shimmer while in flight.
    return null;
  }
  return "Working…";
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
        ) : drawn.length === 0 && failed.length > 0 ? (
          "Drawing failed"
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

/** A sent paste as a chip; the full text opens read-only. */
function PastedFiles({ files }: { files: FileUIPart[] }) {
  const [open, setOpen] = useState<{ name: string; text: string } | null>(null);
  return (
    <>
      <Attachments className="justify-end">
        {files.map((file, index) => (
          <Attachment
            key={`${file.filename}-${index}`}
            data={file}
            onOpen={() =>
              setOpen({ name: file.filename ?? "Pasted text", text: fileUIPartText(file) })
            }
          />
        ))}
      </Attachments>
      <PastedTextDialog paste={open} onClose={() => setOpen(null)} />
    </>
  );
}

const COLLAPSE_OVER_LINES = 12;
const COLLAPSE_OVER_CHARS = 900;

/** A long typed message collapses to a few lines in its bubble, with Show more. */
function UserText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > COLLAPSE_OVER_CHARS || text.split("\n").length > COLLAPSE_OVER_LINES;
  if (!long) return <MessageResponse>{text}</MessageResponse>;
  return (
    <div>
      <div
        className={
          expanded
            ? undefined
            : "max-h-48 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
        }
      >
        <MessageResponse>{text}</MessageResponse>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        className="mt-1 text-muted-foreground text-xs hover:text-foreground"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

function Activity({ label }: { label: string }) {
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
