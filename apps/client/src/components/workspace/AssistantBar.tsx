import { CheckCircle, CaretUp } from "@phosphor-icons/react";
import { type KeyboardEvent } from "react";

interface AssistantBarProps {
  value: string;
  onChange: (val: string) => void;
  onMaximize: () => void;
  onSubmit: () => void;
}

export function AssistantBar({ value, onChange, onMaximize, onSubmit }: AssistantBarProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[580px] h-12 flex flex-row items-center gap-3 px-4 bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl select-none z-50 shadow-lg transition-all hover:bg-white focus-within:bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
      {/* Status Indicator */}
      <CheckCircle size={20} weight="fill" className="text-green-500 shrink-0" />

      {/* Input Field */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message or describe a diagram..."
        className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 placeholder-gray-400 h-full font-medium"
      />

      {/* Separator / Slash */}
      <span className="text-gray-300 font-normal select-none">/</span>

      {/* Maximize Button */}
      <button
        onClick={onMaximize}
        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition cursor-pointer shrink-0"
        title="Open Assistant"
      >
        <CaretUp size={16} weight="bold" />
      </button>
    </div>
  );
}
