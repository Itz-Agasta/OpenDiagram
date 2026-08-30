"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { clearAiSettingsCache } from "@/lib/settings-client";
import { GuestWelcomeDialog } from "@/components/auth/guest-welcome-dialog";
import { CheckoutReturn } from "@/components/billing/checkout-return";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DashboardDialogs } from "@/components/dashboard/dashboard-page/DashboardDialogs";
import { DashboardMain } from "@/components/dashboard/dashboard-page/DashboardMain";
import { DashboardSidebar } from "@/components/dashboard/dashboard-page/DashboardSidebar";
import { useDashboardCreation } from "@/components/dashboard/dashboard-page/use-dashboard-creation";
import { useDashboardData } from "@/components/dashboard/dashboard-page/use-dashboard-data";
import { useDashboardDeletion } from "@/components/dashboard/dashboard-page/use-dashboard-deletion";
import { useDashboardRenaming } from "@/components/dashboard/dashboard-page/use-dashboard-renaming";
import type { DeleteTarget } from "@/components/dashboard/dashboard-page/use-dashboard-deletion";
import type { Project, ProjectFile } from "@/components/dashboard/dashboard-page/types";

export default function DashboardPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user;
  const data = useDashboardData(user, session.isPending);
  const creation = useDashboardCreation(data, data.isSignedIn);
  const renaming = useDashboardRenaming(data);
  const deletion = useDashboardDeletion(data);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signedOutDialogOpen, setSignedOutDialogOpen] = useState(false);
  const accountName = user?.name || user?.email || "Guest";

  async function signOut() {
    setSignOutPending(true);
    try {
      await authClient.signOut();
      clearAiSettingsCache();
      data.resetSavedProjects();
      setSignedOutDialogOpen(true);
    } finally {
      setSignOutPending(false);
    }
  }

  function openProject(project: Project) {
    const fileId = project.files[0]?.fileId ?? "";
    router.push(`/project/${project.id}/workspace/${fileId}`);
  }

  function openFile(file: ProjectFile) {
    router.push(`/project/${file.projectId}/workspace/${file.fileId ?? ""}`);
  }

  return (
    <main className="h-dvh overflow-hidden bg-od-surface text-od-ink">
      {/* Suspense because it reads search params, which Next requires a boundary for. */}
      <Suspense fallback={null}>
        <CheckoutReturn />
      </Suspense>
      <div className="flex h-full w-full overflow-hidden">
        <DashboardSidebar
          accountId={user?.id}
          accountImage={user?.image}
          accountName={accountName}
          editingFileKey={renaming.editingFileKey}
          editingProjectId={renaming.editingProjectId}
          expandedProjectId={data.expandedProjectId}
          filteredProjects={data.filteredProjects}
          isSignedIn={data.isSignedIn}
          loading={data.loading}
          nameDraft={renaming.nameDraft}
          onBeginEditFile={renaming.beginEditFile}
          onBeginEditProject={renaming.beginEditProject}
          onCancelEdit={renaming.cancelEdit}
          onCommitFile={(file) => void renaming.commitFile(file)}
          onCommitProject={(project) => void renaming.commitProject(project)}
          onCreateFile={creation.openFileModal}
          onCreateProject={creation.openProjectModal}
          onDeleteFile={deletion.requestDeleteFile}
          onDeleteProject={deletion.requestDeleteProject}
          onOpenFile={openFile}
          onOpenProject={openProject}
          onSignOut={() => void signOut()}
          onToggleProject={(projectId) =>
            data.setExpandedProjectId((current) => (current === projectId ? null : projectId))
          }
          projectSearch={data.projectSearch}
          projects={data.projects}
          setNameDraft={renaming.setNameDraft}
          setProjectSearch={data.setProjectSearch}
          signOutPending={signOutPending}
        />
        <DashboardMain
          creating={creation.agentCreatePending}
          loading={data.loading}
          signedIn={data.isSignedIn}
          onCreate={(input) => void creation.createProjectFromAgent(input)}
        />
      </div>
      <DashboardDialogs
        fileKind={creation.fileKind}
        fileName={creation.fileName}
        onCloseFile={() => creation.setFileModalProjectId(null)}
        onCloseProject={() => creation.setProjectModalOpen(false)}
        onContinueAsGuest={() => setSignedOutDialogOpen(false)}
        onCreateFile={creation.createFile}
        onCreateProject={creation.createDashboardProject}
        projectModalOpen={creation.projectModalOpen}
        projectName={creation.projectName}
        projectPending={creation.projectPending}
        selectedProject={creation.selectedProject}
        setFileKind={creation.setFileKind}
        setFileName={creation.setFileName}
        setProjectName={creation.setProjectName}
        signedOutDialogOpen={signedOutDialogOpen}
      />
      <ConfirmDeleteDialog
        open={Boolean(deletion.deleteTarget)}
        title={deletion.deleteTarget?.kind === "file" ? "Delete file" : "Delete project"}
        description={describeDeleteTarget(deletion.deleteTarget)}
        pending={deletion.deletePending}
        onCancel={deletion.cancelDelete}
        onConfirm={() => void deletion.confirmDelete()}
      />
      <GuestWelcomeDialog />
    </main>
  );
}

/** Names the thing being thrown away, since the dialog is the last chance to read it. */
function describeDeleteTarget(target: DeleteTarget | null) {
  if (!target) return "";
  if (target.kind === "file") {
    return `"${target.file.name}" will be permanently deleted. This cannot be undone.`;
  }

  // Files carrying no fileId are the placeholder row an empty project shows, not
  // stored files, so counting them would promise a deletion that isn't happening.
  const fileCount = target.project.files.filter((file) => file.fileId).length;
  const files = fileCount === 1 ? "1 file" : `${fileCount} files`;
  return `"${target.project.name}" and its ${files} will be permanently deleted. This cannot be undone.`;
}
