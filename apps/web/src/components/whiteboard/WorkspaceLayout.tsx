"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SignedOutDialog } from "@/components/auth/signed-out-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWaitlistJoin } from "@/lib/use-waitlist-join";
import { WorkspaceAgentSidebar } from "./workspace-layout/WorkspaceAgentSidebar";
import { FirstFileDialog, LeavePromptDialog } from "./workspace-layout/WorkspaceDialogs";
import { WorkspaceEditorPane } from "./workspace-layout/WorkspaceEditorPane";
import { WorkspaceHeader } from "./workspace-layout/WorkspaceHeader";
import { WorkspaceSidebar } from "./workspace-layout/WorkspaceSidebar";
import { hasDiagramScene, hasDiagramSpec } from "./workspace-layout/helpers";
import { useWorkspaceLayoutController } from "./workspace-layout/useWorkspaceLayoutController";

export function WorkspaceLayout() {
  const { state, actions } = useWorkspaceLayoutController();
  const searchParams = useSearchParams();
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  const [providerErrorMessage, setProviderErrorMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!providerErrorMessage) return;
    const timeout = window.setTimeout(() => setProviderErrorMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [providerErrorMessage]);
  const [signedOutDialogOpen, setSignedOutDialogOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const {
    status: waitlistStatus,
    errorMessage: waitlistError,
    join: joinWaitlist,
    reset: resetWaitlist,
  } = useWaitlistJoin();
  const activeHistory = state.activeFile?.history;
  const agentProjectId = state.isSignedIn ? state.activeFile?.projectId : undefined;
  const agentFileId = state.activeFile?.id ?? state.currentFileId ?? undefined;
  const agentFileIdentity = state.activeFile
    ? `${state.activeFile.projectId}:${state.activeFile.id}`
    : undefined;

  async function handleJoinWaitlist(event: React.FormEvent) {
    event.preventDefault();
    if (!state.isSignedIn && !waitlistEmail.trim()) return;

    await joinWaitlist(state.isSignedIn ? undefined : waitlistEmail.trim());
  }

  async function handleSignOut() {
    await actions.signOut();
    setSignedOutDialogOpen(true);
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-od-surface text-od-ink">
      {state.isSignedIn && state.isSidebarOpen && (
        <WorkspaceSidebar
          accountImage={state.accountImage}
          accountName={state.accountName}
          activeFileId={state.activeFileId}
          files={state.sidebarFilesForProject}
          isSignedIn={state.isSignedIn}
          onClose={actions.closeSidebar}
          onCreateFile={(type) => void actions.createWorkspaceFile(type)}
          onDeleteFile={(fileId) => void actions.deleteWorkspaceFile(fileId)}
          onOpenFile={actions.openWorkspaceFile}
          onResizeStart={actions.handleResizeStart}
          onSignIn={actions.signInToSave}
          onSignOut={() => void handleSignOut()}
          projectName={state.sidebarProjectName}
          width={state.sidebarWidth}
        />
      )}

      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <WorkspaceHeader
          activeFileName={state.activeFileName}
          hasWorkspace={Boolean(state.draft || state.isSignedIn)}
          isAgentOpen={state.isAgentOpen}
          isSidebarOpen={state.isSidebarOpen}
          isEditingName={state.isEditingName}
          isSignedIn={state.isSignedIn}
          nameDraft={state.nameDraft}
          onBeginEditName={actions.beginEditName}
          onCancelName={actions.cancelName}
          onCommitName={() => void actions.commitName()}
          onNameDraftChange={actions.setNameDraft}
          onOpenAgent={actions.openAgent}
          onOpenSidebar={actions.openSidebar}
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
          initialSpec={state.activeFile?.spec}
          hasExistingScene={
            hasDiagramScene(state.initialScene) || hasDiagramSpec(state.activeFile?.spec)
          }
          isContextPending={state.agentContextPending}
          onClose={actions.closeAgent}
          onHistoryChange={actions.handleAgentHistoryChange}
          onQuotaError={setQuotaMessage}
          onProviderError={setProviderErrorMessage}
          onResizeStart={actions.handleResizeStart}
          initialModelId={searchParams.get("modelId") ?? undefined}
          initialProviderId={searchParams.get("providerId") ?? undefined}
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
      <SignedOutDialog
        open={signedOutDialogOpen}
        redirectTo="/dashboard"
        onContinueAsGuest={actions.continueAsGuest}
      />
      <Dialog
        open={providerErrorMessage !== null}
        onOpenChange={(open) => {
          if (!open) setProviderErrorMessage(null);
        }}
      >
        <DialogContent className="border-od-border-soft bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-od-ink">Provider credits exhausted</DialogTitle>
            <DialogDescription className="leading-6 text-od-ink-muted">
              {providerErrorMessage}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Dialog
        open={quotaMessage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQuotaMessage(null);
            setWaitlistEmail("");
            resetWaitlist();
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
                      if (waitlistStatus === "error") resetWaitlist();
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
                  {waitlistError}
                </p>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
