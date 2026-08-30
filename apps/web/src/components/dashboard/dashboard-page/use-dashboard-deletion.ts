import { useState } from "react";
import { toast } from "sonner";
import { deleteGuestProjectDraft } from "@/lib/guest-drafts";
import { forgetLocalFiles } from "@/lib/local-file-cleanup";
import { deleteProject, deleteProjectFile } from "@/lib/projects-client";
import type { DashboardData } from "./use-dashboard-data";
import type { Project, ProjectFile } from "./types";

export type DeleteTarget =
  | { kind: "project"; project: Project }
  | { kind: "file"; file: ProjectFile };

export function useDashboardDeletion(data: DashboardData) {
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [pending, setPending] = useState(false);

  function requestDeleteProject(project: Project) {
    setTarget({ kind: "project", project });
  }

  function requestDeleteFile(file: ProjectFile) {
    if (!file.fileId) return;
    setTarget({ kind: "file", file });
  }

  function cancelDelete() {
    if (pending) return;
    setTarget(null);
  }

  async function deleteTargetProject(project: Project) {
    if (project.source === "guest") {
      deleteGuestProjectDraft(project.id);
      data.setGuestDrafts((current) => current.filter((draft) => draft.id !== project.id));
    } else {
      await deleteProject(project.id);
      data.setSavedProjects((current) => current.filter((item) => item.id !== project.id));
      data.setFilesByProject((current) => {
        const { [project.id]: _removed, ...rest } = current;
        return rest;
      });
    }
    // Guest and saved alike: both keep scenes and chats in IndexedDB keyed by
    // file id. Placeholder rows carry no fileId and own nothing to forget.
    forgetLocalFiles(project.files.flatMap((file) => (file.fileId ? [file.fileId] : [])));

    // The tree keeps one project expanded by id, and that id is about to name
    // nothing, which leaves the accordion stuck open on a gap.
    data.setExpandedProjectId((current) => (current === project.id ? null : current));
  }

  async function confirmDelete() {
    if (!target || pending) return;
    setPending(true);

    try {
      if (target.kind === "project") {
        await deleteTargetProject(target.project);
        toast.success(`Deleted "${target.project.name}".`);
      } else {
        const { file } = target;
        if (!file.fileId) return;
        await deleteProjectFile(file.projectId, file.fileId);
        forgetLocalFiles([file.fileId]);
        data.setFilesByProject((current) => ({
          ...current,
          [file.projectId]: (current[file.projectId] ?? []).filter(
            (item) => item.id !== file.fileId,
          ),
        }));
        toast.success(`Deleted "${file.name}".`);
      }
      setTarget(null);
    } catch (error) {
      const fallback =
        target.kind === "project" ? "Could not delete project." : "Could not delete file.";
      toast.error(error instanceof Error ? error.message : fallback);
    } finally {
      setPending(false);
    }
  }

  return {
    cancelDelete,
    confirmDelete,
    deletePending: pending,
    deleteTarget: target,
    requestDeleteFile,
    requestDeleteProject,
  };
}
