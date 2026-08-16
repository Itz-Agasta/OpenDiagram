import {
  CaretLeft,
  ArrowUp,
  ArrowUUpLeft,
  ArrowUUpRight,
  CheckCircle,
} from "@phosphor-icons/react";
import { useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import type { UIMessage } from "ai";
import { ThinkingState } from "#/components/ui/ThinkingState";
import { StreamingText } from "#/components/ui/StreamingText";
import {
  isAskUserPart,
  isDrawDiagramPart,
  type AskUserInput,
  type ChatToolPart,
  type DrawDiagramOutput,
} from "#/lib/utils/diagram-chat";

const PILL = "max-w-[80%] px-3.5 py-2 rounded-xl text-sm leading-relaxed bg-gray-100 text-gray-800";

const DEFAULT_MODEL = "Roxy";

interface AssistantPanelProps {
  messages: UIMessage[];
  input: string;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e?: unknown) => void;
  setInput: (value: string) => void;
  onClose: () => void;
  isLoading: boolean;
  onAnswerAskUser?: (toolCallId: string, answer: string) => void;
  error?: string | null;
  applyError?: string | null;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function AssistantPanel({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  setInput,
  onClose,
  isLoading,
  onAnswerAskUser,
  error,
  applyError,
}: AssistantPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const last = messages.at(-1);
  const waitingForResponse =
    isLoading &&
    (last?.role !== "assistant" ||
      !last.parts.some(
        (part) =>
          (part.type === "text" && part.text) ||
          (isAskUserPart(part) && part.state !== "input-streaming") ||
          isDrawDiagramPart(part),
      ));

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
  };

  const suggestions = [
    "Kanban board",
    "Wellness center hero",
    "Notes app entry view",
    "Running application flow",
  ];

  return (
    <div className="assistant-panel absolute bottom-20 left-1/2 -translate-x-1/2 w-[580px] h-[520px] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 font-geist">
      {/* Conversation View */}
      <div className="flex-1 flex flex-col bg-white min-h-0">
        {/* Active Chat Header */}
        <div className="p-3 border-b border-gray-200/80 flex items-center justify-between select-none bg-white sticky top-0 z-10">
          <div className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-800">
            <span>Chat Assistant</span>
            {isLoading && (
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse ml-1" />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer"
            title="Close Panel"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
        </div>

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex justify-start">
              <div className={PILL}>
                Hello! I can help you design software architectures, ER diagrams, or microservices
                flows. What would you like to build today?
              </div>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.role === "user") {
              const text = getMessageText(msg);
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className={PILL}>{text}</div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="space-y-3">
                {msg.parts.map((part, partIdx) => {
                  const key = `${msg.id}-${partIdx}`;
                  if (part.type === "text" && part.text) {
                    return (
                      <div key={key} className="flex justify-start">
                        <StreamingText
                          text={part.text}
                          className="!text-gray-800 [&>span]:!bg-gray-800"
                        />
                      </div>
                    );
                  }

                  if (isAskUserPart(part)) {
                    return (
                      <AskUserPartView key={key} part={part} onAnswerAskUser={onAnswerAskUser} />
                    );
                  }

                  if (isDrawDiagramPart(part)) {
                    return <DrawDiagramPartView key={key} part={part} />;
                  }

                  return null;
                })}
              </div>
            );
          })}
          {waitingForResponse && (
            <div className="flex justify-start">
              <ThinkingState />
            </div>
          )}
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          {applyError && (
            <p className="text-xs text-red-500 font-medium">
              Couldn't draw on canvas — {applyError}
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion Chips */}
        <div className="px-4 py-2 flex flex-row gap-1.5 overflow-x-auto select-none no-scrollbar">
          {suggestions.map((sug) => (
            <button
              key={sug}
              onClick={() => handleSuggestionClick(sug)}
              className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 rounded-full text-[11px] font-medium text-gray-600 hover:text-gray-800 transition cursor-pointer shrink-0"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Rich Input Editor Container */}
        <div className="p-4 border-t border-gray-100">
          <div className="border border-gray-200 rounded-xl bg-gray-50/50 focus-within:bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all flex flex-col">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask assistant to draw architecture or edit diagram..."
              className="w-full px-3.5 py-2.5 bg-transparent border-none outline-none resize-none text-sm text-gray-800 placeholder-gray-400 h-16"
            />
            {/* Input Action Toolbar */}
            <div className="flex flex-row items-center justify-between px-3 py-2 border-t border-gray-100 select-none">
              {/* Tool Indicators */}
              <div className="flex items-center gap-1.5 text-gray-400">
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 border border-gray-200/60 px-1.5 py-0.5 rounded">
                  {DEFAULT_MODEL}
                </span>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-medium">⇧↵ New line</span>
                <button className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 cursor-pointer">
                  <ArrowUUpLeft size={14} weight="bold" />
                </button>
                <button className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 cursor-pointer">
                  <ArrowUUpRight size={14} weight="bold" />
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="p-1.5 bg-blue-600 disabled:bg-blue-300 text-white rounded-full transition cursor-pointer flex items-center justify-center"
                >
                  <ArrowUp size={14} weight="bold" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AskUserPartView({
  part,
  onAnswerAskUser,
}: {
  part: ChatToolPart;
  onAnswerAskUser?: (toolCallId: string, answer: string) => void;
}) {
  if (part.state === "input-streaming") {
    return (
      <div className="flex justify-start">
        <div className="text-xs text-gray-400 italic">Preparing a question...</div>
      </div>
    );
  }
  if (part.state === "output-error") {
    return (
      <div className="flex justify-start">
        <div className="text-xs text-red-500 font-medium">{part.errorText}</div>
      </div>
    );
  }

  const input = part.input as AskUserInput | undefined;
  if (!input?.question) return null;
  const answered = part.state === "output-available" ? (part.output as string) : null;

  return (
    <div className="flex justify-start">
      <div className={`${PILL} px-4 py-3 space-y-2.5`}>
        <p className="font-medium text-gray-900">{input.question}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(input.options ?? []).map((option) => (
            <button
              key={option}
              disabled={answered !== null}
              onClick={() => onAnswerAskUser?.(part.toolCallId, option)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition border ${
                answered === option
                  ? "bg-blue-600 border-blue-600 text-white"
                  : answered !== null
                    ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 cursor-pointer"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DrawDiagramPartView({ part }: { part: ChatToolPart }) {
  const title = (part.input as { title?: string } | undefined)?.title;
  if (part.state === "output-available") {
    const summary = (part.output as DrawDiagramOutput | undefined)?.summary;
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <CheckCircle size={14} weight="fill" className="text-blue-600" />
        <span>
          {summary
            ? `${summary.title} — ${summary.nodes} nodes, ${summary.edges} edges`
            : title
              ? `Drew “${title}”`
              : "Diagram drawn"}
        </span>
      </div>
    );
  }
  if (part.state === "output-error") {
    return <p className="text-xs text-red-500 font-medium">Drawing failed: {part.errorText}</p>;
  }
  return (
    <div className="text-xs text-gray-400 italic">
      {title ? `Drawing “${title}”…` : "Drawing diagram…"}
    </div>
  );
}
