import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface PastedTextDialogProps {
  /** The pasted text and its chip label; null keeps the dialog closed. */
  paste: { name: string; text: string } | null;
  onClose: () => void;
  /** Composer only: put the text back in the input and drop the chip. */
  onInsertAsText?: () => void;
}

export function PastedTextDialog({ paste, onClose, onInsertAsText }: PastedTextDialogProps) {
  return (
    <Dialog open={paste !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col gap-3">
        <DialogTitle className="text-sm">{paste?.name}</DialogTitle>
        <DialogDescription className="sr-only">The full pasted text, read-only.</DialogDescription>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-od-border-soft bg-od-surface p-3 font-mono text-xs">
          {paste?.text}
        </pre>
        {onInsertAsText && (
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={onInsertAsText}>
              Insert as text
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
