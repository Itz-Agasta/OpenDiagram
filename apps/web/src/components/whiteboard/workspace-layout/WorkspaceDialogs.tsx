type DialogShellProps = {
  open: boolean;
  children: React.ReactNode;
};

function DialogShell({ open, children }: DialogShellProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4">
      <div className="w-full max-w-[420px] rounded-[18px] border border-od-border-soft bg-white p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]">
        {children}
      </div>
    </div>
  );
}

type FirstFileDialogProps = {
  firstFileName: string;
  open: boolean;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

type LeavePromptDialogProps = {
  open: boolean;
  onLeave: () => void;
  onSignIn: () => void;
};

export function FirstFileDialog({
  firstFileName,
  open,
  onCancel,
  onNameChange,
  onSubmit,
}: FirstFileDialogProps) {
  return (
    <DialogShell open={open}>
      <h2 className="text-[18px] font-semibold text-od-ink">Name your file</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <input
          autoFocus
          value={firstFileName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. Checkout architecture"
          className="h-11 rounded-[8px] border border-od-border-soft px-3 text-[14px] text-od-ink outline-none transition placeholder:text-od-ink-faint focus:border-od-ink"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink"
          >
            Go to dashboard
          </button>
          <button
            type="submit"
            className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-white"
          >
            Create file
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

export function LeavePromptDialog({ open, onLeave, onSignIn }: LeavePromptDialogProps) {
  return (
    <DialogShell open={open}>
      <h2 className="text-[18px] font-semibold text-od-ink">You&apos;ll lose your work</h2>
      <p className="mt-2 text-[14px] leading-6 text-od-ink-muted">
        Sign in to save this guest draft to your workspace before leaving.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onLeave}
          className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink-muted hover:text-od-ink"
        >
          Leave without saving
        </button>
        <button
          type="button"
          onClick={onSignIn}
          className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-white"
        >
          Login / Sign up
        </button>
      </div>
    </DialogShell>
  );
}
