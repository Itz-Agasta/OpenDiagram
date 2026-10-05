"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CreationQuotaError } from "@/lib/projects-client";
import { GuestWelcomeDialog } from "@/components/auth/guest-welcome-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExportPopover, REOPEN_EXPORT_KEY } from "./export/ExportPopover";
import { QuotaDialog } from "./workspace-layout/QuotaDialog";
import { WorkspaceAgentSidebar } from "./workspace-layout/WorkspaceAgentSidebar";
import { FirstFileDialog, LeavePromptDialog } from "./workspace-layout/WorkspaceDialogs";
import { WorkspaceEditorPane } from "./workspace-layout/WorkspaceEditorPane";
import { WorkspaceHeader } from "./workspace-layout/WorkspaceHeader";
import { hasDiagramScene, hasDiagramSpec } from "./workspace-layout/helpers";
import { useWorkspaceLayoutController } from "./workspace-layout/useWorkspaceLayoutController";

export function WorkspaceLayout() {
  const { state, actions } = useWorkspaceLayoutController();
  const searchParams = useSearchParams();
  const [quotaError, setQuotaError] = useState<CreationQuotaError | null>(null);
  const [providerErrorMessage, setProviderErrorMessage] = useState<string | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!providerErrorMessage) return;
    const timeout = window.setTimeout(() => setProviderErrorMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [providerErrorMessage]);
  const [exportOpen, setExportOpen] = useState(false);
  // A guest who signed in from the export panel lands back with it open.
  // agentProjectId, not isSignedIn: it stays unset until the draft lookup resolves
  // and promotion is done, which replaces the URL and would close the panel again.
  useEffect(() => {
    if (!state.agentProjectId || !state.excalidrawAPI || state.agentFileType === "doc") return;
    try {
      if (!sessionStorage.getItem(REOPEN_EXPORT_KEY)) return;
      sessionStorage.removeItem(REOPEN_EXPORT_KEY);
    } catch {
      return;
    }
    setExportOpen(true);
  }, [state.agentProjectId, state.excalidrawAPI, state.agentFileType]);
  const byokSettingsHref = state.isSignedIn
    ? "/dashboard/settings"
    : "/login?redirect=%2Fdashboard%2Fsettings";

  return (
    <div className="flex h-full w-full overflow-hidden bg-od-surface text-od-ink">
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <WorkspaceHeader
          activeFileName={state.activeFileName}
          exportControl={
            // Not while loading: the API still points at the previous file's scene.
            !state.fileLoading &&
            state.excalidrawAPI &&
            state.agentFileType !== "doc" && (
              <ExportPopover
                api={state.excalidrawAPI}
                fileName={state.activeFileName}
                isSignedIn={state.isSignedIn}
                open={exportOpen}
                onOpenChange={setExportOpen}
                onSignIn={actions.signInToSave}
              />
            )
          }
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
          onBackToDashboard={() => void actions.navigateToDashboard()}
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
          onExport={() => setExportOpen(true)}
          onSceneChange={actions.handleSceneChange}
        />
      </main>

      <WorkspaceAgentSidebar
        activeFileType={state.agentFileType}
        allowSeedAutoRun={state.isAgentOpen && !state.agentSeedPending}
        agentWidth={state.agentWidth}
        excalidrawAPI={state.excalidrawAPI}
        fileIdentity={state.agentFileIdentity}
        fileId={state.agentFileId}
        initialHistory={state.activeHistory}
        initialSpec={state.activeFile?.spec}
        hasExistingScene={
          hasDiagramScene(state.initialScene) || hasDiagramSpec(state.activeFile?.spec)
        }
        isContextPending={state.agentContextPending}
        onClose={actions.closeAgent}
        onHistoryChange={actions.handleAgentHistoryChange}
        onQuotaError={setQuotaError}
        onProviderError={setProviderErrorMessage}
        onRateLimitError={setRateLimitMessage}
        onResizeStart={actions.handleResizeStart}
        initialModelId={searchParams.get("modelId") ?? undefined}
        initialProviderId={searchParams.get("providerId") ?? undefined}
        isOpen={state.isAgentOpen}
        projectId={state.agentProjectId}
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
      <QuotaDialog
        error={quotaError}
        byokSettingsHref={byokSettingsHref}
        onClose={() => setQuotaError(null)}
      />
    </div>
  );
}
