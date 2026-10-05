import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import type { SaveStatus } from "./helpers";

type WorkspaceHeaderProps = {
  activeFileName: string;
  /** Export control, absent for docs and before the canvas has mounted. */
  exportControl?: ReactNode;
  isAgentOpen: boolean;
  isEditingName: boolean;
  isSignedIn: boolean;
  nameDraft: string;
  projectName: string;
  saveError: string | null;
  saveStatus: SaveStatus;
  hasWorkspace: boolean;
  onBeginEditName: () => void;
  onCancelName: () => void;
  onCommitName: () => void;
  onNameDraftChange: (value: string) => void;
  onOpenAgent: () => void;
  onBackToDashboard: () => void;
  onSave: () => void;
  onSignIn: () => void;
};

const iconButton =
  "grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink";

export function WorkspaceHeader({
  activeFileName,
  exportControl,
  isAgentOpen,
  isEditingName,
  isSignedIn,
  nameDraft,
  projectName,
  saveError,
  saveStatus,
  hasWorkspace,
  onBeginEditName,
  onCancelName,
  onCommitName,
  onNameDraftChange,
  onOpenAgent,
  onBackToDashboard,
  onSave,
  onSignIn,
}: WorkspaceHeaderProps) {
  // Rename, create and delete failures land here too, not only saves, so they
  // get a toast rather than a slot in the bar.
  useEffect(() => {
    if (saveError) toast.error(saveError);
  }, [saveError]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-od-border-soft bg-white px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
          {projectName && (
            <>
              {/* The way home, so visible at every width. An in-app link rather than
                  the browser's Back: arrivals from a shared link, login or draft
                  promotion have no dashboard behind them, and this path saves first. */}
              <button
                type="button"
                onClick={onBackToDashboard}
                title="Back to dashboard"
                className="h-7 max-w-[16rem] truncate px-1 text-od-ink-faint underline-offset-4 transition hover:text-od-ink hover:underline"
              >
                {projectName}
              </button>
              <span aria-hidden className="text-od-ink-faint/60">
                /
              </span>
            </>
          )}
          {isEditingName ? (
            <input
              autoFocus
              aria-label="File name"
              value={nameDraft}
              onChange={(event) => onNameDraftChange(event.target.value)}
              onBlur={onCommitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                else if (event.key === "Escape") onCancelName();
              }}
              className="h-7 min-w-0 rounded-[6px] border border-od-border-soft px-1.5 font-medium text-od-ink outline-none focus:border-od-ink"
            />
          ) : (
            <button
              type="button"
              onClick={onBeginEditName}
              title="Rename file"
              className="h-7 min-w-0 truncate rounded-[6px] px-1.5 text-left font-medium text-od-ink transition hover:bg-od-canvas/45"
            >
              {activeFileName}
            </button>
          )}
        </nav>
      </div>
      {hasWorkspace && (
        <div className="flex shrink-0 items-center gap-2">
          {isSignedIn ? (
            <SaveButton status={saveStatus} error={saveError} onSave={onSave} />
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="h-8 rounded-[8px] bg-od-ink px-3 text-[12px] font-medium text-white"
            >
              Sign in to save
            </button>
          )}
          {exportControl}
          {!isAgentOpen && (
            <button
              type="button"
              onClick={onOpenAgent}
              className={iconButton}
              aria-label="Open agent panel"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </header>
  );
}

/** One control for both the manual save and the autosave state (#60). */
function SaveButton({
  status,
  error,
  onSave,
}: {
  status: SaveStatus;
  error: string | null;
  onSave: () => void;
}) {
  // Green for a moment after a save lands, then quiet: the grey "Saved" alone is
  // also the resting state, and read as "nothing happened" after a click.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (status !== "saved") return;
    setJustSaved(true);
    const timeout = window.setTimeout(() => setJustSaved(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const base =
    "flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-medium transition-colors duration-500";

  if (status === "saving") {
    return (
      <button type="button" disabled className={`${base} cursor-wait text-od-ink-faint`}>
        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
        Saving
      </button>
    );
  }
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onSave}
        title={error ?? "Save failed"}
        className={`${base} border border-red-200 text-red-600 hover:bg-red-50`}
      >
        <AlertCircle aria-hidden className="h-3.5 w-3.5" />
        Retry save
      </button>
    );
  }
  if (status === "unsaved") {
    return (
      <button
        type="button"
        onClick={onSave}
        title="Autosaves shortly. Save now to sync immediately."
        className={`${base} bg-od-ink text-white hover:bg-od-ink/90`}
      >
        Save
      </button>
    );
  }
  // idle and saved: nothing pending. Still clickable, a re-save is harmless.
  return (
    <button
      type="button"
      onClick={onSave}
      title="All changes saved"
      className={`${base} hover:bg-od-canvas/45 hover:text-od-ink ${justSaved ? "text-od-green" : "text-od-ink-faint"}`}
    >
      <Check aria-hidden className="h-3.5 w-3.5" />
      Saved
    </button>
  );
}
