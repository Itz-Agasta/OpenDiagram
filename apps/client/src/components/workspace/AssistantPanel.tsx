import {
  Plus,
  CaretLeft,
  CaretDown,
  Paperclip,
  PaintBrush,
  ArrowsOut,
  Image as ImageIcon,
  ArrowUp,
  ArrowUUpLeft,
  ArrowUUpRight,
} from "@phosphor-icons/react";
import { useState, useRef, useEffect, type KeyboardEvent } from "react";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
}

interface AssistantPanelProps {
  initialValue: string;
  onClose: () => void;
}

export function AssistantPanel({ initialValue, onClose }: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Hello! I can help you design software architectures, ER diagrams, or microservices flows. What would you like to build today?",
    },
  ]);
  const [inputValue, setInputValue] = useState(initialValue);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync initial input value if it changes from the bottom bar
  useEffect(() => {
    if (initialValue) {
      setInputValue(initialValue);
    }
  }, [initialValue]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: inputValue.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    // Simulate Assistant Response
    setTimeout(() => {
      const assistantMsg: Message = {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Here is a preliminary design for "${userMsg.text}". Let me generate the diagram specification for you.`,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }, 1000);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (text: string) => {
    setInputValue(text);
  };

  const suggestions = [
    "Kanban board",
    "Wellness center hero",
    "Notes app entry view",
    "Running application flow",
  ];

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[760px] h-[520px] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-row overflow-hidden z-50 font-geist">
      {/* Left Pane - Chats Explorer */}
      <div className="w-[220px] bg-gray-50 border-r border-gray-200/80 flex flex-col select-none">
        {/* Chats Header */}
        <div className="p-3.5 border-b border-gray-200/80 flex flex-row items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">Chats</span>
          <div className="flex items-center gap-1">
            <button className="p-1 hover:bg-gray-200/60 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer">
              <Plus size={14} weight="bold" />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200/60 rounded-md transition text-gray-500 hover:text-gray-900 cursor-pointer"
              title="Close Panel"
            >
              <CaretLeft size={14} weight="bold" />
            </button>
          </div>
        </div>

        {/* Chats List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-200/60 text-gray-900 rounded-lg text-xs font-semibold cursor-pointer">
            <span>New Chat</span>
            <span className="text-[10px] text-gray-400 bg-white/80 border border-gray-200/60 px-1 rounded">
              ⌘1
            </span>
          </div>

          <div className="pt-4 px-3 pb-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Archived
            </span>
          </div>
          <div className="px-3 py-1.5 text-[11px] text-gray-400 italic">No archived chats</div>
        </div>
      </div>

      {/* Right Pane - Conversation View */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Active Chat Header */}
        <div className="p-3 border-b border-gray-200/80 flex items-center justify-between select-none">
          <button className="flex items-center gap-1 px-2 py-1 hover:bg-gray-50 rounded-md transition text-xs font-semibold text-gray-800 cursor-pointer">
            <span>New Chat</span>
            <CaretDown size={12} weight="bold" className="text-gray-400" />
          </button>
        </div>

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white rounded-tr-none"
                    : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200/60"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
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
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask assistant to draw architecture or edit diagram..."
              className="w-full px-3.5 py-2.5 bg-transparent border-none outline-none resize-none text-sm text-gray-800 placeholder-gray-400 h-16"
            />
            {/* Input Action Toolbar */}
            <div className="flex flex-row items-center justify-between px-3 py-2 border-t border-gray-100 select-none">
              {/* Tool Indicators */}
              <div className="flex items-center gap-1.5 text-gray-400">
                <button className="p-1.5 hover:bg-gray-100 rounded-lg hover:text-gray-700 transition cursor-pointer">
                  <Paperclip size={14} weight="bold" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded-lg hover:text-gray-700 transition cursor-pointer">
                  <PaintBrush size={14} weight="bold" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded-lg hover:text-gray-700 transition cursor-pointer">
                  <ArrowsOut size={14} weight="bold" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded-lg hover:text-gray-700 transition cursor-pointer">
                  <ImageIcon size={14} weight="bold" />
                </button>
                <div className="h-4 w-[1px] bg-gray-200 mx-1" />
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 border border-gray-200/60 px-1.5 py-0.5 rounded">
                  Opus 4.8
                </span>
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 border border-gray-200/60 px-1.5 py-0.5 rounded">
                  Default
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
                  disabled={!inputValue.trim()}
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
