"use client";

import { useState } from "react";
import { History, Plus } from "lucide-react";
import type { ChatThreadSummary } from "@/lib/projects-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AIChatThreadBarProps {
  disabled?: boolean;
  loadThreadList: () => Promise<void>;
  onResumeThread: (threadId: string) => void;
  startNewThread: () => Promise<void>;
  threads: ChatThreadSummary[];
}

/**
 * "New chat" plus the history list, the two controls threading needs.
 *
 * The list is fetched when it is opened rather than with the panel: it is
 * metadata only, nobody looks at it most sessions, and loading it eagerly would
 * put a request in front of a canvas that just wants to draw.
 */
export function AIChatThreadBar({
  disabled,
  loadThreadList,
  onResumeThread,
  startNewThread,
  threads,
}: AIChatThreadBarProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleOpenChange(open: boolean) {
    if (!open) return;
    setIsLoading(true);
    try {
      await loadThreadList();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between border-od-line border-b px-3 py-1.5">
      <DropdownMenu onOpenChange={(open) => void handleOpenChange(open)}>
        <DropdownMenuTrigger
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-od-ink/60 text-xs hover:bg-od-surface hover:text-od-ink disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          type="button"
        >
          <History aria-hidden="true" className="size-3.5" />
          History
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Previous chats</DropdownMenuLabel>
          {isLoading && <div className="px-2 py-1.5 text-od-ink/50 text-xs">Loading…</div>}
          {!isLoading && threads.length === 0 && (
            <div className="px-2 py-1.5 text-od-ink/50 text-xs">No previous chats.</div>
          )}
          {threads.map((thread) => (
            <DropdownMenuItem
              className="flex-col items-start gap-0.5 text-xs"
              key={thread.id}
              onSelect={() => onResumeThread(thread.id)}
            >
              <span className="w-full truncate">{thread.title}</span>
              <span className="text-od-ink/45 text-[10px]">
                {new Date(thread.updatedAt).toLocaleString()}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-od-ink/60 text-xs hover:bg-od-surface hover:text-od-ink disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => void startNewThread()}
        type="button"
      >
        <Plus aria-hidden="true" className="size-3.5" />
        New chat
      </button>
    </div>
  );
}
