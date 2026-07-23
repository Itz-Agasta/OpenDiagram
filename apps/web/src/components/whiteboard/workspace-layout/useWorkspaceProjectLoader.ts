import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { getGuestProjectDraft, type GuestProjectDraft } from "@/lib/guest-drafts";
import {
  getProject,
  getProjectFile,
  listProjectFiles,
  type SavedProject,
  type SavedProjectFile,
} from "@/lib/projects-client";
import type { useWorkspaceLayoutStore } from "@/lib/workspace-layout-store";
import { fileContentToText, toSidebarFile } from "./helpers";

type ProjectSnapshot = Parameters<
  ReturnType<typeof useWorkspaceLayoutStore.getState>["setProjectSnapshot"]
>[0];

interface LoaderOptions {
  currentFileIdRef: RefObject<string | null>;
  draft: GuestProjectDraft | null;
  draftRef: RefObject<GuestProjectDraft | null>;
  initializePersistence: (type: SavedProjectFile["type"], scene: unknown, content: string) => void;
  isSignedIn: boolean;
  projectId: string;
  sessionPending: boolean;
  setActiveFile: Dispatch<SetStateAction<SavedProjectFile | null>>;
  setDocContent: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<GuestProjectDraft | null>>;
  setFileLoading: Dispatch<SetStateAction<boolean>>;
  setFirstFileName: Dispatch<SetStateAction<string>>;
  setInitialScene: Dispatch<SetStateAction<unknown>>;
  setProject: Dispatch<SetStateAction<SavedProject | null>>;
  setProjectSnapshot: (snapshot: ProjectSnapshot) => void;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setShowFirstFileDialog: Dispatch<SetStateAction<boolean>>;
  workspaceId?: string;
}

export function useWorkspaceProjectLoader(options: LoaderOptions) {
  const {
    currentFileIdRef,
    draft,
    draftRef,
    initializePersistence,
    isSignedIn,
    projectId,
    sessionPending,
    setActiveFile,
    setDocContent,
    setDraft,
    setFileLoading,
    setFirstFileName,
    setInitialScene,
    setProject,
    setProjectSnapshot,
    setSaveError,
    setShowFirstFileDialog,
    workspaceId,
  } = options;

  useEffect(() => {
    const nextDraft = getGuestProjectDraft(projectId);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (!nextDraft) {
      currentFileIdRef.current = null;
      setInitialScene(null);
      return;
    }

    setProject(null);
    const file = workspaceId
      ? nextDraft.files.find((item) => item.id === workspaceId)
      : nextDraft.files[0];
    currentFileIdRef.current = file?.id ?? nextDraft.files[0]?.id ?? null;
    const type = file?.type ?? "diagram";
    const now = new Date().toISOString();
    setActiveFile(
      file
        ? {
            id: file.id,
            projectId: nextDraft.id,
            type,
            name: file.name,
            scene: file.scene,
            spec: file.spec,
            content: file.content,
            history: file.history ?? [],
            createdAt: now,
            updatedAt: now,
          }
        : null,
    );
    setProjectSnapshot({
      projectId: nextDraft.id,
      projectName: nextDraft.name,
      files: nextDraft.files.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type ?? "diagram",
      })),
      activeFileId: currentFileIdRef.current,
    });
    const content = type === "doc" ? fileContentToText(file?.content) : "";
    const scene = type === "diagram" ? (file?.scene ?? null) : null;
    initializePersistence(type, scene, content);
    setDocContent(content);
    setInitialScene(scene);
    setFileLoading(false);
  }, [
    currentFileIdRef,
    draftRef,
    initializePersistence,
    projectId,
    setActiveFile,
    setDocContent,
    setDraft,
    setFileLoading,
    setInitialScene,
    setProject,
    setProjectSnapshot,
    workspaceId,
  ]);

  useEffect(() => {
    if (sessionPending || !isSignedIn || draftRef.current) return;
    let active = true;

    async function loadActiveFile() {
      setSaveError(null);
      setFileLoading(true);
      try {
        const [project, files] = await Promise.all([
          getProject(projectId),
          listProjectFiles(projectId),
        ]);
        const firstFile = files[0];
        if (!workspaceId && !firstFile) {
          if (active) {
            setProject(project);
            setProjectSnapshot({
              projectId: project.id,
              projectName: project.name,
              files: [],
              activeFileId: null,
            });
            setShowFirstFileDialog(true);
            setFirstFileName("");
          }
          return;
        }
        const result = await getProjectFile(projectId, workspaceId ?? firstFile!.id);
        if (!active) return;
        setProject(project);
        setActiveFile(result);
        setProjectSnapshot({
          projectId: project.id,
          projectName: project.name,
          files: files.map(toSidebarFile),
          activeFileId: result.id,
        });
        currentFileIdRef.current = result.id;
        const scene = result.type === "diagram" ? (result.scene ?? null) : null;
        const content = result.type === "doc" ? fileContentToText(result.content) : "";
        initializePersistence(result.type, scene, content);
        setDocContent(content);
        setInitialScene(scene);
      } catch (error) {
        if (active)
          setSaveError(error instanceof Error ? error.message : "Could not load project file.");
      } finally {
        if (active) setFileLoading(false);
      }
    }

    void loadActiveFile();
    return () => {
      active = false;
    };
  }, [
    currentFileIdRef,
    draft,
    draftRef,
    initializePersistence,
    isSignedIn,
    projectId,
    sessionPending,
    setActiveFile,
    setDocContent,
    setFileLoading,
    setFirstFileName,
    setInitialScene,
    setProject,
    setProjectSnapshot,
    setSaveError,
    setShowFirstFileDialog,
    workspaceId,
  ]);
}
