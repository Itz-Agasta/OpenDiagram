"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { joinWaitlist } from "@/lib/projects-client";
import { WorkspaceAgentSidebar } from "./workspace-layout/WorkspaceAgentSidebar";
import { FirstFileDialog, LeavePromptDialog } from "./workspace-layout/WorkspaceDialogs";
import { WorkspaceEditorPane } from "./workspace-layout/WorkspaceEditorPane";
import { WorkspaceHeader } from "./workspace-layout/WorkspaceHeader";
import { WorkspaceSidebar } from "./workspace-layout/WorkspaceSidebar";
import { hasDiagramScene } from "./workspace-layout/helpers";
import { useWorkspaceLayoutController } from "./workspace-layout/useWorkspaceLayoutController";

export function WorkspaceLayout() {
  const { state, actions } = useWorkspaceLayoutController();
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "joining" | "joined" | "error">(
    "idle",
  );
  const activeHistory = state.activeFile?.history;
  const agentProjectId = state.isSignedIn ? state.activeFile?.projectId : undefined;
  const agentFileId = state.activeFile?.id ?? state.currentFileId ?? undefined;
  const agentFileIdentity = state.activeFile
    ? `${state.activeFile.projectId}:${state.activeFile.id}`
    : undefined;

  async function handleJoinWaitlist(event: React.FormEvent) {
    event.preventDefault();
    if (!state.isSignedIn && !waitlistEmail.trim()) return;

    setWaitlistStatus("joining");
    try {
      await joinWaitlist(state.isSignedIn ? undefined : waitlistEmail.trim());
      setWaitlistStatus("joined");
    } catch {
      setWaitlistStatus("error");
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-od-surface text-od-ink">
      <WorkspaceSidebar
        accountImage={state.accountImage}
        accountName={state.accountName}
        activeFileId={state.activeFileId}
        files={state.sidebarFilesForProject}
        isSignedIn={state.isSignedIn}
        onOpenFile={actions.openWorkspaceFile}
        onResizeStart={actions.handleResizeStart}
        onSignIn={actions.signInToSave}
        onSignOut={() => void actions.signOut()}
        projectName={state.sidebarProjectName}
        width={state.sidebarWidth}
      />

      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <WorkspaceHeader
          activeFileName={state.activeFileName}
          hasWorkspace={Boolean(state.draft || state.isSignedIn)}
          isAgentOpen={state.isAgentOpen}
          isEditingName={state.isEditingName}
          isSignedIn={state.isSignedIn}
          nameDraft={state.nameDraft}
          onBeginEditName={actions.beginEditName}
          onCancelName={actions.cancelName}
          onCommitName={() => void actions.commitName()}
          onNameDraftChange={actions.setNameDraft}
          onOpenAgent={actions.openAgent}
          onSave={() => void actions.saveActiveFile()}
          onSignIn={actions.signInToSave}
          projectName={state.sidebarProjectName}
          saveError={state.saveError}
          saveStatus={state.saveStatus}
        />
        <WorkspaceEditorPane
          activeFile={state.activeFile}
          docContent={state.docContent}
          initialScene={state.initialScene}
          isLoading={state.fileLoading}
          onDocChange={actions.handleDocChange}
          onExcalidrawAPI={actions.handleExcalidrawAPI}
          onSceneChange={actions.handleSceneChange}
        />
      </main>

      {state.isAgentOpen && (
        <WorkspaceAgentSidebar
          activeFileType={state.activeFile?.type}
          agentWidth={state.agentWidth}
          excalidrawAPI={state.excalidrawAPI}
          fileIdentity={agentFileIdentity}
          fileId={agentFileId}
          initialHistory={activeHistory}
          hasExistingScene={hasDiagramScene(state.initialScene)}
          isContextPending={state.agentContextPending}
          onClose={actions.closeAgent}
          onHistoryChange={actions.handleAgentHistoryChange}
          onQuotaError={setQuotaMessage}
          onResizeStart={actions.handleResizeStart}
          projectId={agentProjectId}
          repoGenerationError={state.repoGenerationError}
          repoGenerationJob={state.repoGenerationJob}
        />
      )}

      <FirstFileDialog
        firstFileName={state.firstFileName}
        onCancel={actions.cancelFirstFileDialog}
        onNameChange={actions.setFirstFileName}
        onSubmit={(event) => void actions.handleCreateFirstFile(event)}
        open={state.showFirstFileDialog}
      />
      <LeavePromptDialog
        onLeave={actions.leaveWithoutSaving}
        onSignIn={actions.signInToSave}
        open={state.leavePromptOpen}
      />
      <Dialog
        open={quotaMessage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQuotaMessage(null);
            setWaitlistEmail("");
            setWaitlistStatus("idle");
          }
        }}
      >
        <DialogContent className="border-od-border-soft bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-od-ink">
              {waitlistStatus === "joined"
                ? "You're on the waitlist"
                : "Beta creation limit reached"}
            </DialogTitle>
            <DialogDescription className="leading-6 text-od-ink-muted">
              {waitlistStatus === "joined"
                ? "We'll let you know when more beta capacity becomes available."
                : quotaMessage}
            </DialogDescription>
          </DialogHeader>
          {waitlistStatus !== "joined" && (
            <form className="mt-2 space-y-3" onSubmit={handleJoinWaitlist}>
              {!state.isSignedIn && (
                <div>
                  <label htmlFor="quota-waitlist-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="quota-waitlist-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Enter your email"
                    value={waitlistEmail}
                    onChange={(event) => {
                      setWaitlistEmail(event.target.value);
                      if (waitlistStatus === "error") setWaitlistStatus("idle");
                    }}
                    className="h-10 w-full rounded-lg border border-od-border-soft bg-white px-3 text-sm text-od-ink outline-none transition focus:border-od-ink-muted"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={waitlistStatus === "joining"}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-od-ink px-4 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
              >
                {waitlistStatus === "joining" && <Loader2 className="size-4 animate-spin" />}
                {waitlistStatus === "joining" ? "Joining…" : "Join the waitlist"}
              </button>
              {waitlistStatus === "error" && (
                <p aria-live="polite" className="text-center text-xs text-red-600">
                  Could not join. Please try again.
                </p>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
