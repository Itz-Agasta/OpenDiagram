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
    <div className="assistant-bar-wrapper absolute bottom-6 left-1/2 -translate-x-1/2 w-[580px] p-[1.5px] bg-gradient-to-r from-blue via-indigo-500 to-orange rounded-xl select-none z-50 shadow-lg transition-all focus-within:ring-1 focus-within:ring-blue-400">
      <div className="assistant-bar-inner w-full flex flex-col p-3 gap-2.5 rounded-[11px]">
        {pendingAsk && (
          <div className="px-1 pb-1.5 border-b border-gray-100">
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

        {/* Top Header Row */}
        <div className="flex items-center justify-between select-none">
          <div className="flex items-center gap-1.5">
            <img src="/mascot.png" className="w-4 h-4 object-contain shrink-0" alt="Mascot" />
            <span className="text-[12px] text-gray-500 font-medium">Agent Chat</span>
          </div>

          <button
            onClick={onMaximize}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100/80 transition cursor-pointer shrink-0"
            title="Open Assistant"
          >
            <CaretUp size={14} weight="bold" />
          </button>
        </div>

        {/* Bottom Input Row */}
        <div className="w-full flex">
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
            className="flex-1 bg-white border border-gray-200/50 rounded-lg px-3 py-1.5 outline-none text-sm text-gray-800 placeholder-gray-400 h-9 font-medium focus:border-gray-300 transition"
          />
        </div>
      </div>
    </div>
  );
}
