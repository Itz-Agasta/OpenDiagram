"use client";

import { useState } from "react";
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
import { hasDiagramScene } from "./workspace-layout/helpers";
import { useWorkspaceLayoutController } from "./workspace-layout/useWorkspaceLayoutController";

export function WorkspaceLayout() {
  const { state, actions } = useWorkspaceLayoutController();
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  const activeHistory = state.activeFile?.history;
  const agentProjectId = state.isSignedIn ? state.activeFile?.projectId : undefined;
  const agentFileId = state.activeFile?.id ?? state.currentFileId ?? undefined;
  const agentFileIdentity = state.activeFile
    ? `${state.activeFile.projectId}:${state.activeFile.id}`
    : undefined;

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
          if (!open) setQuotaMessage(null);
        }}
      >
        <DialogContent className="border-od-border-soft bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-od-ink">Beta creation limit reached</DialogTitle>
            <DialogDescription className="leading-6 text-od-ink-muted">
              {quotaMessage}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
