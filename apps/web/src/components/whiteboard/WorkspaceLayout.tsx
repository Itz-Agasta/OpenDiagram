"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, Sparkles } from "lucide-react";
import { SignedOutDialog } from "@/components/auth/signed-out-dialog";
import { GuestWelcomeDialog } from "@/components/auth/guest-welcome-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!providerErrorMessage) return;
    const timeout = window.setTimeout(() => setProviderErrorMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [providerErrorMessage]);
  const [signedOutDialogOpen, setSignedOutDialogOpen] = useState(false);
  const activeHistory = state.activeFile?.history;
  const byokSettingsHref = state.isSignedIn
    ? "/dashboard/settings"
    : "/login?redirect=%2Fdashboard%2Fsettings";
  const agentProjectId = state.isSignedIn ? state.activeFile?.projectId : undefined;
  const agentFileId = state.activeFile?.id ?? state.currentFileId ?? undefined;
  const agentFileIdentity = state.activeFile
    ? `${state.activeFile.projectId}:${state.activeFile.id}`
    : undefined;

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
          onClose={actions.closeSidebar}
          onCreateFile={(type) => void actions.createWorkspaceFile(type)}
          onDeleteFile={(fileId) => void actions.deleteWorkspaceFile(fileId)}
          onOpenFile={actions.openWorkspaceFile}
          onBackToDashboard={actions.navigateToDashboard}
          onResizeStart={actions.handleResizeStart}
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

      <WorkspaceAgentSidebar
        activeFileType={state.activeFile?.type}
        allowSeedAutoRun={state.isAgentOpen}
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
        onRateLimitError={setRateLimitMessage}
        onResizeStart={actions.handleResizeStart}
        initialModelId={searchParams.get("modelId") ?? undefined}
        initialProviderId={searchParams.get("providerId") ?? undefined}
        isOpen={state.isAgentOpen}
        projectId={agentProjectId}
        repoGenerationError={state.repoGenerationError}
        repoGenerationJob={state.repoGenerationJob}
      />

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
      <GuestWelcomeDialog />
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
        open={rateLimitMessage !== null}
        onOpenChange={(open) => {
          if (!open) setRateLimitMessage(null);
        }}
      >
        <DialogContent className="border-od-border-soft bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-od-ink">AI provider is rate-limited</DialogTitle>
            <DialogDescription className="leading-6 text-od-ink-muted">
              {rateLimitMessage}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Dialog
        open={quotaMessage !== null}
        onOpenChange={(open) => {
          if (!open) setQuotaMessage(null);
        }}
      >
        <DialogContent className="border-od-border-soft bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-od-ink">You've used your creation credits</DialogTitle>
            <DialogDescription className="leading-6 text-od-ink-muted">
              {quotaMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {/* Ordered by what actually converts: paying is the primary path now
                that billing ships, and BYOK is the free alternative we promise
                forever. */}
            <Link
              href="/pricing"
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-od-ink px-4 text-sm font-medium text-od-on-dark transition-opacity hover:opacity-90"
            >
              <Sparkles className="size-4" />
              Upgrade to Pro
            </Link>
            <Link
              href={byokSettingsHref}
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-od-border-soft bg-white px-4 text-sm font-medium text-od-ink transition-colors hover:bg-od-canvas/45"
            >
              <KeyRound className="size-4" />
              Use your own AI key - free, unlimited
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
