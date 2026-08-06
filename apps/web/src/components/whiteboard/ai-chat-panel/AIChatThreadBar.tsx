"use client";

import { useEffect, useState } from "react";
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
  // A dropped history request used to leave the menu reading "No previous
  // chats", which is a claim about the data rather than about the request.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Controlled so the menu can be dismissed when the panel goes busy. Disabling
  // the trigger does nothing to a menu that is ALREADY open, and its items stay
  // clickable -- so a turn submitted with the list open could still be filed
  // against whichever conversation was picked after the message was typed.
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  async function handleOpenChange(open: boolean) {
    if (!open) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      await loadThreadList();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load chat history.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between border-od-line border-b px-3 py-1.5">
      <DropdownMenu
        onOpenChange={(open) => {
          setIsOpen(open);
          void handleOpenChange(open);
        }}
        open={isOpen}
      >
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
          {!isLoading && loadError && (
            <button
              className="w-full px-2 py-1.5 text-left text-destructive text-xs hover:bg-od-surface"
              onClick={() => void handleOpenChange(true)}
              type="button"
            >
              {loadError} Tap to retry.
            </button>
          )}
          {!isLoading && !loadError && threads.length === 0 && (
            <div className="px-2 py-1.5 text-od-ink/50 text-xs">No previous chats.</div>
          )}
          {threads.map((thread) => (
            <DropdownMenuItem
              className="flex-col items-start gap-0.5 text-xs"
              // Belt and braces with the auto-close above: the effect runs
              // after render, so a click landing in the same frame would
              // otherwise still resolve.
              disabled={disabled}
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
