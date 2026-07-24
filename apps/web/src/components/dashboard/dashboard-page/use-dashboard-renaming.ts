import { useRef, useState } from "react";
import { toast } from "sonner";
import { saveGuestProjectDraft } from "@/lib/guest-drafts";
import { updateProject, updateProjectFile } from "@/lib/projects-client";
import type { DashboardData } from "./use-dashboard-data";
import type { Project, ProjectFile } from "./types";

export function useDashboardRenaming(data: DashboardData) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingFileKey, setEditingFileKey] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const skipCommitRef = useRef(false);

  function beginEditProject(project: Project) {
    skipCommitRef.current = false;
    setEditingFileKey(null);
    setEditingProjectId(project.id);
    setNameDraft(project.name);
  }

  function beginEditFile(file: ProjectFile) {
    skipCommitRef.current = false;
    setEditingProjectId(null);
    setEditingFileKey(file.key);
    setNameDraft(file.name);
  }

  function cancelEdit() {
    skipCommitRef.current = true;
    setEditingProjectId(null);
    setEditingFileKey(null);
  }

  async function commitProject(project: Project) {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setEditingProjectId(null);
      return;
    }
    setEditingProjectId(null);
    const name = nameDraft.trim();
    if (!name || name === project.name) return;

    try {
      if (project.source === "saved") {
        const updated = await updateProject(project.id, { name });
        data.setSavedProjects((current) =>
          current.map((item) => (item.id === project.id ? { ...item, name: updated.name } : item)),
        );
      } else {
        const target = data.guestDrafts.find((entry) => entry.id === project.id);
        if (target) {
          const updated = { ...target, name };
          saveGuestProjectDraft(updated);
          data.setGuestDrafts((current) =>
            current.map((item) => (item.id === project.id ? updated : item)),
          );
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename project.");
    }
  }

  async function commitFile(file: ProjectFile) {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setEditingFileKey(null);
      return;
    }
    setEditingFileKey(null);
    const name = nameDraft.trim();
    if (!name || !file.fileId || name === file.name) return;

    try {
      const updated = await updateProjectFile(file.projectId, file.fileId, { name });
      data.setFilesByProject((current) => ({
        ...current,
        [file.projectId]: (current[file.projectId] ?? []).map((item) =>
          item.id === file.fileId ? { ...item, name: updated.name } : item,
        ),
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename file.");
    }
  }

  return {
    beginEditFile,
    beginEditProject,
    cancelEdit,
    commitFile,
    commitProject,
    editingFileKey,
    editingProjectId,
    nameDraft,
    setNameDraft,
  };
}
