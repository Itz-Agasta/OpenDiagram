import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { env } from "@OpenDiagram/env/web";
import { createGuestProjectDraft, saveGuestProjectDraft } from "@/lib/guest-drafts";
import { createProject, createProjectFile, type SavedProjectFile } from "@/lib/projects-client";
import type { DashboardData } from "./use-dashboard-data";
import type { AgentInputSubmit, FileKind } from "./types";
import { deriveAgentProjectNames } from "./utils";

export function useDashboardCreation(data: DashboardData, signedIn: boolean) {
  const router = useRouter();
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [fileModalProjectId, setFileModalProjectId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileKind, setFileKind] = useState<FileKind>("diagram");
  const [projectPending, setProjectPending] = useState(false);
  const [agentCreatePending, setAgentCreatePending] = useState(false);
  const selectedProject = data.projects.find((project) => project.id === fileModalProjectId);

  function openProjectModal() {
    setProjectName("");
    setProjectModalOpen(true);
  }

  function openFileModal(projectId: string) {
    setFileModalProjectId(projectId);
    setFileName("");
    setFileKind("diagram");
  }

  async function createDashboardProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    setProjectPending(true);

    try {
      if (signedIn) {
        const project = await createProject({ name });
        const file = await createFirstFile(project.id, {
          name: "Your first design",
          type: "diagram",
        });
        data.setSavedProjects((current) => [project, ...current]);
        setProjectModalOpen(false);
        setProjectName("");
        router.push(`/project/${project.id}/workspace/${file.id}`);
        return;
      }

      if (!guestProjectAvailable(data.guestDrafts.length)) return;
      const draft = createGuestProjectDraft(name);
      saveGuestProjectDraft(draft);
      data.setGuestDrafts((current) => [draft, ...current]);
      setProjectModalOpen(false);
      setProjectName("");
      router.push(`/project/${draft.id}/workspace`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project.");
    } finally {
      setProjectPending(false);
    }
  }

  async function createProjectFromAgent({ prompt, kind, modelId, providerId }: AgentInputSubmit) {
    if (agentCreatePending) return;
    const names = deriveAgentProjectNames(prompt, kind);
    const firstMessage = { id: crypto.randomUUID(), role: "user" as const, text: prompt };
    const docContent = kind === "doc" ? `# ${names.fileName}\n\n${prompt}\n` : undefined;
    setAgentCreatePending(true);

    try {
      if (signedIn) {
        const project = await createProject({ name: names.projectName, description: prompt });
        const file = await createFirstFile(project.id, {
          name: names.fileName,
          type: kind === "diagram" ? "diagram" : "doc",
          content: docContent,
          history: [firstMessage],
        });
        data.setSavedProjects((current) => [project, ...current]);
        data.setFilesByProject((current) => ({ ...current, [project.id]: [file] }));
        router.push(
          workspaceUrl(`/project/${project.id}/workspace/${file.id}`, providerId, modelId),
        );
        return;
      }

      if (!guestProjectAvailable(data.guestDrafts.length)) return;
      const draft = createGuestProjectDraft(names.projectName, names.fileName, kind, docContent, [
        firstMessage,
      ]);
      saveGuestProjectDraft(draft);
      data.setGuestDrafts((current) => [draft, ...current]);
      router.push(
        workspaceUrl(
          `/project/${draft.id}/workspace/${draft.files[0]?.id ?? ""}`,
          providerId,
          modelId,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project.");
    } finally {
      setAgentCreatePending(false);
    }
  }

  async function createFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fileName.trim();
    if (!selectedProject || !name) return;
    if (selectedProject.source === "guest") {
      setFileModalProjectId(null);
      toast.error("Log in to save your project before adding files.");
      return;
    }
    setProjectPending(true);

    try {
      const file = await createProjectFile(selectedProject.id, {
        name,
        type: fileKind === "diagram" ? "diagram" : "doc",
      });
      data.setFilesByProject((current) => ({
        ...current,
        [selectedProject.id]: [...(current[selectedProject.id] ?? []), file],
      }));
      data.setExpandedProjectId(selectedProject.id);
      setFileModalProjectId(null);
      setFileName("");
      router.push(`/project/${selectedProject.id}/workspace/${file.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create file.");
    } finally {
      setProjectPending(false);
    }
  }

  return {
    agentCreatePending,
    createDashboardProject,
    createFile,
    createProjectFromAgent,
    fileKind,
    fileName,
    openFileModal,
    openProjectModal,
    projectModalOpen,
    projectName,
    projectPending,
    selectedProject,
    setFileKind,
    setFileModalProjectId,
    setFileName,
    setProjectModalOpen,
    setProjectName,
  };
}

function workspaceUrl(path: string, providerId?: string, modelId?: string) {
  const params = new URLSearchParams();
  if (providerId && modelId) {
    params.set("providerId", providerId);
    params.set("modelId", modelId);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

async function createFirstFile(
  projectId: string,
  input: Parameters<typeof createProjectFile>[1],
): Promise<SavedProjectFile> {
  try {
    return await createProjectFile(projectId, input);
  } catch (error) {
    void fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/projects/${projectId}`, {
      method: "DELETE",
      credentials: "include",
    });
    throw error;
  }
}

function guestProjectAvailable(existingProjects: number) {
  if (existingProjects < 1) return true;
  toast.error("You can try one project as a guest. Log in to save it and create more.");
  return false;
}
