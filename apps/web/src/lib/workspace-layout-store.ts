import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProjectFileType } from "@/lib/projects-client";

export type WorkspaceSidebarFile = {
  id: string;
  name: string;
  type: ProjectFileType;
};

type WorkspaceLayoutStore = {
  agentWidth: number;
  isAgentOpen: boolean;
  projectId: string | null;
  projectName: string;
  files: WorkspaceSidebarFile[];
  activeFileId: string | null;
  setAgentWidth: (width: number) => void;
  openAgent: () => void;
  closeAgent: () => void;
  setProjectSnapshot: (snapshot: {
    projectId: string;
    projectName: string;
    files: WorkspaceSidebarFile[];
    activeFileId: string | null;
  }) => void;
  upsertFile: (file: WorkspaceSidebarFile) => void;
};

export const useWorkspaceLayoutStore = create<WorkspaceLayoutStore>()(
  persist(
    (set) => ({
      agentWidth: 384,
      isAgentOpen: true,
      projectId: null,
      projectName: "OpenDiagram",
      files: [],
      activeFileId: null,
      setAgentWidth: (width) => set({ agentWidth: width }),
      openAgent: () => set({ isAgentOpen: true }),
      closeAgent: () => set({ isAgentOpen: false }),
      setProjectSnapshot: (snapshot) =>
        set({
          projectId: snapshot.projectId,
          projectName: snapshot.projectName,
          files: snapshot.files,
          activeFileId: snapshot.activeFileId,
        }),
      upsertFile: (file) =>
        set((state) => {
          const exists = state.files.some((item) => item.id === file.id);

          return {
            files: exists
              ? state.files.map((item) => (item.id === file.id ? file : item))
              : [file, ...state.files],
          };
        }),
    }),
    {
      name: "workspace-layout",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        agentWidth: state.agentWidth,
        isAgentOpen: state.isAgentOpen,
      }),
    },
  ),
);
