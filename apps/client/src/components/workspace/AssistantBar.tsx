import { CaretUp } from "@phosphor-icons/react";
import { type KeyboardEvent } from "react";
import { AskUserChips } from "./AskUserChips";

interface AssistantBarProps {
  value: string;
  onChange: (val: string) => void;
  onMaximize: () => void;
  onSubmit: () => void;
  placeholder?: string;
  pendingAsk?: { toolCallId: string; question: string; options: string[] } | null;
  onAnswerAskUser?: (toolCallId: string, answer: string) => void;
}

export function AssistantBar({
  value,
  onChange,
  onMaximize,
  onSubmit,
  placeholder,
  pendingAsk,
  onAnswerAskUser,
}: AssistantBarProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="assistant-bar absolute bottom-6 left-1/2 -translate-x-1/2 w-[580px] flex flex-col border border-white/50 rounded-xl select-none z-50 shadow-lg transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
      {pendingAsk && (
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          <AskUserChips
            question={pendingAsk.question}
            options={pendingAsk.options}
            onAnswer={(answer) => {
              onChange("");
              onAnswerAskUser?.(pendingAsk.toolCallId, answer);
            }}
          />
        </div>
      )}
      <div className="h-12 flex flex-row items-center gap-3 px-4">
        <img src="/mascot.png" className="w-5 h-5 object-contain shrink-0" alt="Mascot" />

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            pendingAsk
              ? "Type an answer or pick an option…"
              : placeholder || "Type a message or describe a diagram..."
          }
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 placeholder-gray-400 h-full font-medium"
        />

        <span className="text-gray-300 font-normal select-none">/</span>

        <button
          onClick={onMaximize}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition cursor-pointer shrink-0"
          title="Open Assistant"
        >
          <CaretUp size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
