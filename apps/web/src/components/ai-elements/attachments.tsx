"use client";

import { cn } from "@/lib/utils";
import type { FileUIPart } from "ai";
import { FileTextIcon, ImageIcon, PaperclipIcon, XIcon } from "lucide-react";
import type { HTMLAttributes } from "react";

// Trimmed from the AI Elements registry to the inline variant the chat panel
// uses: grid/list layouts, media previews and the hover card are left out.

export type AttachmentData = FileUIPart & { id?: string };

const iconFor = (data: AttachmentData) =>
  data.mediaType?.startsWith("image/")
    ? ImageIcon
    : data.mediaType?.startsWith("text/") || data.mediaType?.startsWith("application/")
      ? FileTextIcon
      : PaperclipIcon;

export const Attachments = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-wrap items-start gap-1.5", className)} {...props} />
);

export type AttachmentProps = {
  data: AttachmentData;
  /** Opens a preview. Without it the chip is a plain label. */
  onOpen?: () => void;
  onRemove?: () => void;
  className?: string;
};

export const Attachment = ({ data, onOpen, onRemove, className }: AttachmentProps) => {
  const Icon = iconFor(data);
  const label = data.filename || "Attachment";
  const body = (
    <>
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-od-surface">
        <Icon className="size-3 text-muted-foreground" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </>
  );

  return (
    <div
      className={cn(
        "flex h-8 max-w-full items-center gap-0.5 rounded-md border border-od-border-soft bg-white pr-0.5 pl-1.5 text-xs",
        className,
      )}
      title={label}
    >
      {onOpen ? (
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded hover:text-foreground"
          onClick={onOpen}
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">{body}</span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-od-surface hover:text-foreground"
          onClick={onRemove}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );
};
