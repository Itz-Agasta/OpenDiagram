"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The one confirmation shown before anything is deleted, dashboard and workspace.
 *
 * Radix rather than `window.confirm` so the copy can name the thing being thrown
 * away and the confirm button can hold a pending state; the native dialog can do
 * neither, and it also blocks the event loop while the user reads it.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  pending,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent
        showCloseButton={!pending}
        className="max-w-[440px] rounded-[16px] border-od-border-soft bg-od-surface p-5"
      >
        <DialogHeader className="mb-1 text-left">
          <DialogTitle className="text-[18px]">{title}</DialogTitle>
          <DialogDescription className="text-[14px] leading-6 text-od-ink-muted">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="h-10 rounded-[8px] bg-red-600 px-4 text-[14px] font-medium text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
          >
            {pending ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
