import type { FormEvent } from "react";
import { FileText, PenTool } from "lucide-react";
import { SignedOutDialog } from "@/components/auth/signed-out-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FileKind, Project } from "./types";

interface DashboardDialogsProps {
  fileKind: FileKind;
  fileName: string;
  onCloseFile: () => void;
  onCloseProject: () => void;
  onContinueAsGuest: () => void;
  onCreateFile: (event: FormEvent<HTMLFormElement>) => void;
  onCreateProject: (event: FormEvent<HTMLFormElement>) => void;
  projectModalOpen: boolean;
  projectName: string;
  projectPending: boolean;
  selectedProject?: Project;
  setFileKind: (kind: FileKind) => void;
  setFileName: (name: string) => void;
  setProjectName: (name: string) => void;
  signedOutDialogOpen: boolean;
}

export function DashboardDialogs(props: DashboardDialogsProps) {
  return (
    <>
      <Dialog
        open={props.projectModalOpen}
        onOpenChange={(open) => !open && props.onCloseProject()}
      >
        <DialogContent className="max-w-[440px] rounded-[16px] border-od-border-soft bg-od-surface p-5">
          <DialogHeader className="mb-1 text-left">
            <DialogTitle className="text-[18px]">New project</DialogTitle>
          </DialogHeader>
          <form onSubmit={props.onCreateProject} className="grid gap-4">
            <TextField
              label="Project name"
              value={props.projectName}
              onChange={props.setProjectName}
              placeholder="e.g. Payments Platform"
            />
            <DialogActions
              onCancel={props.onCloseProject}
              pending={props.projectPending}
              submitLabel="Create project"
            />
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(props.selectedProject)}
        onOpenChange={(open) => !open && props.onCloseFile()}
      >
        <DialogContent className="max-w-[440px] rounded-[16px] border-od-border-soft bg-od-surface p-5">
          <DialogHeader className="mb-1 text-left">
            <DialogTitle className="text-[18px]">
              New file in {props.selectedProject?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={props.onCreateFile} className="grid gap-4">
            <TextField
              label="File name"
              value={props.fileName}
              onChange={props.setFileName}
              placeholder="e.g. Checkout architecture"
            />
            <div className="grid gap-2">
              <p className="text-[13px] font-medium text-od-ink-muted">File type</p>
              <div className="grid grid-cols-2 gap-2">
                {(["diagram", "doc"] as const).map((kind) => {
                  const Icon = kind === "diagram" ? PenTool : FileText;
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={props.fileKind === kind}
                      onClick={() => props.setFileKind(kind)}
                      className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-od-border-soft text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated aria-pressed:border-od-ink aria-pressed:bg-od-ink aria-pressed:text-od-on-dark"
                    >
                      <Icon className="h-4 w-4" />
                      {kind === "diagram" ? "Canvas" : "Doc"}
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogActions
              onCancel={props.onCloseFile}
              pending={props.projectPending}
              submitLabel="Create file"
            />
          </form>
        </DialogContent>
      </Dialog>
      <SignedOutDialog
        open={props.signedOutDialogOpen}
        redirectTo="/dashboard"
        onContinueAsGuest={props.onContinueAsGuest}
      />
    </>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-2 text-[13px] font-medium text-od-ink-muted">
      {label}
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-[8px] border border-od-border-soft px-3 text-[14px] text-od-ink outline-none transition placeholder:text-od-ink-faint focus:border-od-ink"
      />
    </label>
  );
}

function DialogActions({
  onCancel,
  pending,
  submitLabel,
}: {
  onCancel: () => void;
  pending?: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="h-10 rounded-[8px] border border-od-border-soft px-4 text-[14px] font-medium text-od-ink transition hover:bg-od-surface-elevated"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-[8px] bg-od-ink px-4 text-[14px] font-medium text-od-on-dark transition hover:bg-[#2a2a2a] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Creating..." : submitLabel}
      </button>
    </div>
  );
}
