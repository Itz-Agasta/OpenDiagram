import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProjectFileType } from "@/lib/projects-client";

export type WorkspaceSidebarFile = {
  id: string;
  name: string;
  type: ProjectFileType;
};

type WorkspaceLayoutStore = {
  sidebarWidth: number;
  agentWidth: number;
  isAgentOpen: boolean;
  projectId: string | null;
  projectName: string;
  files: WorkspaceSidebarFile[];
  activeFileId: string | null;
  setSidebarWidth: (width: number) => void;
  setAgentWidth: (width: number) => void;
  openAgent: () => void;
  closeAgent: () => void;
  toggleAgent: () => void;
  setProjectSnapshot: (snapshot: {
    projectId: string;
    projectName: string;
    files: WorkspaceSidebarFile[];
    activeFileId: string | null;
  }) => void;
  setActiveFileId: (fileId: string | null) => void;
  upsertFile: (file: WorkspaceSidebarFile) => void;
  clearProject: (projectId?: string) => void;
};

export const useWorkspaceLayoutStore = create<WorkspaceLayoutStore>()(
  persist(
    (set) => ({
      sidebarWidth: 280,
      agentWidth: 384,
      isAgentOpen: true,
      projectId: null,
      projectName: "OpenDiagram",
      files: [],
      activeFileId: null,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setAgentWidth: (width) => set({ agentWidth: width }),
      openAgent: () => set({ isAgentOpen: true }),
      closeAgent: () => set({ isAgentOpen: false }),
      toggleAgent: () => set((state) => ({ isAgentOpen: !state.isAgentOpen })),
      setProjectSnapshot: (snapshot) =>
        set({
          projectId: snapshot.projectId,
          projectName: snapshot.projectName,
          files: snapshot.files,
          activeFileId: snapshot.activeFileId,
        }),
      setActiveFileId: (fileId) => set({ activeFileId: fileId }),
      upsertFile: (file) =>
        set((state) => {
          const exists = state.files.some((item) => item.id === file.id);

          return {
            files: exists
              ? state.files.map((item) => (item.id === file.id ? file : item))
              : [file, ...state.files],
          };
        }),
      clearProject: (projectId) =>
        set((state) => {
          if (projectId && state.projectId !== projectId) return state;

          return {
            projectId: null,
            projectName: "OpenDiagram",
            files: [],
            activeFileId: null,
          };
        }),
    }),
    {
      name: "workspace-layout",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        agentWidth: state.agentWidth,
        isAgentOpen: state.isAgentOpen,
      }),
    },
  ),
);
