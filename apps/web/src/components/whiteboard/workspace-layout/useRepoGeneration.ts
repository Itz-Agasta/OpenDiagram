import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { User } from "better-auth";
import {
  getProject,
  listProjectFiles,
  streamRepoGeneration,
  type RepoGenerationJob,
  type SavedProject,
} from "@/lib/projects-client";
import type { GuestProjectDraft } from "@/lib/guest-drafts";
import type { useWorkspaceLayoutStore } from "@/lib/workspace-layout-store";
import { toSidebarFile } from "./helpers";

type ProjectSnapshot = Parameters<
  ReturnType<typeof useWorkspaceLayoutStore.getState>["setProjectSnapshot"]
>[0];

interface UseRepoGenerationOptions {
  activeFileIdRef: RefObject<string | null>;
  draft: GuestProjectDraft | null;
  project: SavedProject | null;
  setProject: Dispatch<SetStateAction<SavedProject | null>>;
  setProjectSnapshot: (snapshot: ProjectSnapshot) => void;
  user?: User | null;
}

export function useRepoGeneration({
  activeFileIdRef,
  draft,
  project,
  setProject,
  setProjectSnapshot,
  user,
}: UseRepoGenerationOptions) {
  const [job, setJob] = useState<RepoGenerationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || draft || project?.source !== "github_import") return;
    if (project.generationStatus === "done") {
      setJob(null);
      return;
    }
    if (startedProjectRef.current === project.id) return;

    let cancelled = false;
    const abortController = new AbortController();
    startedProjectRef.current = project.id;
    setError(null);

    async function syncSidebarFiles() {
      if (!project) return;
      const files = await listProjectFiles(project.id);
      setProjectSnapshot({
        projectId: project.id,
        projectName: project.name,
        files: files.map(toSidebarFile),
        activeFileId: activeFileIdRef.current,
      });
    }

    async function start() {
      if (!project) return;
      try {
        const finalJob = await streamRepoGeneration(
          project.id,
          (nextJob) => {
            if (cancelled) return;
            setJob(nextJob);
            if (nextJob.createdFiles.length > 0) void syncSidebarFiles().catch(() => undefined);
          },
          abortController.signal,
        );
        if (cancelled || (finalJob.status !== "done" && finalJob.status !== "failed")) return;
        const updatedProject = await getProject(project.id).catch(() => null);
        if (updatedProject && !cancelled) setProject(updatedProject);
      } catch (caught) {
        if (cancelled) return;
        startedProjectRef.current = null;
        setError(
          caught instanceof Error ? caught.message : "Could not start repository generation.",
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeFileIdRef, draft, project, setProject, setProjectSnapshot, user]);

  return { repoGenerationError: error, repoGenerationJob: job };
}
