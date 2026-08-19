import {
  CaretDown,
  ArrowUp,
  ArrowUUpLeft,
  ArrowUUpRight,
  CheckCircle,
  Paperclip,
  X,
} from "@phosphor-icons/react";
import { useRef, useEffect, useState, type KeyboardEvent, type ChangeEvent } from "react";
import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "#/lib/api";
import { aiSettingsQueryOptions, providerModelOptions } from "#/lib/api/settings-client";
import { ThinkingState } from "#/components/ui/ThinkingState";
import { StreamingText } from "#/components/ui/StreamingText";
import {
  isAskUserPart,
  isDrawDiagramPart,
  type AskUserInput,
  type ChatToolPart,
  type DrawDiagramOutput,
} from "#/lib/utils/diagram-chat";
import { AskUserChips } from "./AskUserChips";
const PILL = "max-w-[80%] px-3.5 py-2 rounded-xl text-sm leading-relaxed bg-gray-100 text-gray-800";

interface AssistantPanelProps {
  messages: UIMessage[];
  input: string;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (
    e?: unknown,
    files?: { type: "file"; mediaType: string; filename: string; url: string }[],
  ) => void;
  setInput: (value: string) => void;
  onClose: () => void;
  isLoading: boolean;
  onAnswerAskUser?: (toolCallId: string, answer: string) => void;
  error?: string | null;
  applyError?: string | null;
  selectedModelId?: string;
  onSelectModel?: (modelId: string | null, providerId: string | null) => void;
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
  selectedModelId,
  onSelectModel,
}: AssistantPanelProps) {
  const { data: session } = useQuery(sessionQueryOptions);
  const { data: settings } = useQuery(aiSettingsQueryOptions(session?.user?.id, !!session?.user));
  const modelOptions = settings ? providerModelOptions(settings) : [];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<
    { id: string; name: string; url: string; file: File }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).filter((file) => file.type.startsWith("image/"));
    const newAttachments = newFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      url: URL.createObjectURL(file),
      file,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((x) => x.id !== id);
    });
  };

  useEffect(() => {
    return () => {
      attachments.forEach((att) => {
        URL.revokeObjectURL(att.url);
      });
    };
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const files: { type: "file"; mediaType: string; filename: string; url: string }[] =
      await Promise.all(
        attachments.map(async (att) => {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(att.file);
          });
          return {
            type: "file" as const,
            mediaType: att.file.type,
            filename: att.name,
            url: dataUrl,
          };
        }),
      );

    handleSubmit(null, files);
    attachments.forEach((att) => URL.revokeObjectURL(att.url));
    setAttachments([]);
  };

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
      void handleSend();
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
    <div className="assistant-panel absolute bottom-20 left-1/2 -translate-x-1/2 w-[580px] h-[520px] border border-white/50 rounded-2xl shadow-2xl flex flex-col z-50 font-geist">
      {/* Conversation View */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-2xl">
        {/* Active Chat Header */}
        <div className="p-3 border-b border-white/40 flex items-center justify-between select-none shrink-0">
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
            <CaretDown size={16} weight="bold" />
          </button>
        </div>

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex justify-start">
              <p className="text-sm leading-relaxed text-gray-800">
                Hello! I can help you design software architectures, ER diagrams, or microservices
                flows. What would you like to build today?
              </p>
            </div>
          )}
          {messages.map((msg, index) => {
            if (msg.role === "user") {
              const text = getMessageText(msg);
              const partsFiles = msg.parts?.filter((part) => part.type === "file") ?? [];
              const legacyAttachments = (() => {
                if (!msg || typeof msg !== "object") return [];
                if (
                  "experimental_attachments" in msg &&
                  Array.isArray(msg.experimental_attachments)
                ) {
                  return msg.experimental_attachments;
                }
                if ("attachments" in msg && Array.isArray(msg.attachments)) {
                  return msg.attachments;
                }
                return [];
              })();

              return (
                <div key={msg.id} className="flex flex-col items-end gap-2">
                  {partsFiles.map((file, fileIdx) => {
                    const fileUrl = "url" in file && typeof file.url === "string" ? file.url : null;
                    const filename =
                      "filename" in file && typeof file.filename === "string"
                        ? file.filename
                        : "Attached Image";
                    return fileUrl ? (
                      <div
                        key={`part-${fileIdx}`}
                        className="max-w-[200px] rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-white shrink-0"
                      >
                        <img
                          src={fileUrl}
                          className="w-full h-auto max-h-[150px] object-contain"
                          alt={filename}
                        />
                      </div>
                    ) : null;
                  })}
                  {legacyAttachments.map((att, attIdx) => {
                    if (
                      att &&
                      typeof att === "object" &&
                      "url" in att &&
                      typeof att.url === "string"
                    ) {
                      const name =
                        "name" in att && typeof att.name === "string" ? att.name : "Attached Image";
                      return (
                        <div
                          key={`att-${attIdx}`}
                          className="max-w-[200px] rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-white shrink-0"
                        >
                          <img
                            src={att.url}
                            className="w-full h-auto max-h-[150px] object-contain"
                            alt={name}
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                  {text && <div className={PILL}>{text}</div>}
                </div>
              );
            }

            return (
              <div key={msg.id} className="space-y-3">
                {msg.parts.map((part, partIdx) => {
                  const key = `${msg.id}-${partIdx}`;
                  if (part.type === "text" && part.text) {
                    const isLastMessage = index === messages.length - 1;
                    return (
                      <div key={key} className="flex justify-start">
                        <StreamingText
                          text={part.text}
                          className="!text-gray-800 [&>span]:!bg-gray-800"
                          showCursor={
                            isLastMessage && isLoading && partIdx === msg.parts.length - 1
                          }
                        />
                      </div>
                    );
                  }

                  if (isAskUserPart(part)) {
                    return (
                      <AskUserPartView
                        key={key}
                        part={part}
                        onAnswerAskUser={onAnswerAskUser}
                        interactive={index === messages.length - 1}
                      />
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
        <div className="p-4 border-t border-white/40">
          <div className="border border-gray-200 rounded-xl bg-white/40 focus-within:bg-white/60 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all flex flex-col">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              className="hidden"
            />

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/30">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative group w-12 h-12 rounded-lg border border-gray-200 overflow-hidden bg-white shrink-0"
                  >
                    <img src={att.url} className="w-full h-full object-cover" alt={att.name} />
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-0 right-0 p-0.5 bg-gray-900/80 hover:bg-gray-900 text-white rounded-bl-lg transition cursor-pointer"
                      title="Remove image"
                    >
                      <X size={10} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                {modelOptions.length > 0 ? (
                  <div className="flex items-center text-[10px] font-semibold text-gray-400 bg-gray-100 border border-gray-200/60 rounded px-1.5 py-0.5 select-none hover:bg-gray-200 hover:text-gray-600 transition relative cursor-pointer font-geist">
                    <select
                      value={selectedModelId || "platform"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "platform") {
                          onSelectModel?.(null, null);
                        } else {
                          const opt = modelOptions.find((o) => o.id === val);
                          if (opt) {
                            onSelectModel?.(opt.modelId, opt.providerId);
                          }
                        }
                      }}
                      className="bg-transparent border-none text-gray-400 font-semibold outline-none cursor-pointer hover:text-gray-600 transition pr-3.5"
                      style={{
                        fontSize: "10px",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        appearance: "none",
                      }}
                    >
                      <option value="platform" className="text-gray-700 bg-white">
                        Platform (Roxy)
                      </option>
                      {modelOptions.map((opt) => (
                        <option key={opt.id} value={opt.id} className="text-gray-700 bg-white">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center">
                      <span className="text-[6px]">▼</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 border border-gray-200/60 px-1.5 py-0.5 rounded select-none font-geist">
                    Platform (Roxy)
                  </span>
                )}
              </div>
              {/* Action Controls */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-medium">⇧↵ New line</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 cursor-pointer"
                  title="Attach images"
                >
                  <Paperclip size={14} weight="bold" />
                </button>
                <button className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 cursor-pointer">
                  <ArrowUUpLeft size={14} weight="bold" />
                </button>
                <button className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 cursor-pointer">
                  <ArrowUUpRight size={14} weight="bold" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && attachments.length === 0}
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
  interactive,
}: {
  part: ChatToolPart;
  onAnswerAskUser?: (toolCallId: string, answer: string) => void;
  interactive: boolean;
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
  const canAnswer = interactive && part.state === "input-available";

  return (
    <div className="flex justify-start">
      <div className={`${PILL} px-4 py-3 space-y-2.5`}>
        <AskUserChips
          question={input.question}
          options={input.options ?? []}
          answered={answered}
          disabled={!canAnswer}
          onAnswer={canAnswer ? (answer) => onAnswerAskUser?.(part.toolCallId, answer) : undefined}
        />
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
