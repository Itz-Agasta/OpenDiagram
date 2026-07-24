"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { GuestWelcomeDialog } from "@/components/auth/guest-welcome-dialog";
import { DashboardDialogs } from "@/components/dashboard/dashboard-page/DashboardDialogs";
import { DashboardMain } from "@/components/dashboard/dashboard-page/DashboardMain";
import { DashboardSidebar } from "@/components/dashboard/dashboard-page/DashboardSidebar";
import { useDashboardCreation } from "@/components/dashboard/dashboard-page/use-dashboard-creation";
import { useDashboardData } from "@/components/dashboard/dashboard-page/use-dashboard-data";
import { useDashboardRenaming } from "@/components/dashboard/dashboard-page/use-dashboard-renaming";
import type { Project, ProjectFile } from "@/components/dashboard/dashboard-page/types";

export default function DashboardPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user;
  const data = useDashboardData(user, session.isPending);
  const creation = useDashboardCreation(data, data.isSignedIn);
  const renaming = useDashboardRenaming(data);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signedOutDialogOpen, setSignedOutDialogOpen] = useState(false);
  const accountName = user?.name || user?.email || "Guest";

  async function signOut() {
    setSignOutPending(true);
    try {
      await authClient.signOut();
      data.setSavedProjects([]);
      data.setSavedProjectsLoaded(false);
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
      <GuestWelcomeDialog />
    </main>
  );
}
