import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { User } from "better-auth";
import { listGuestProjectDrafts, type GuestProjectDraft } from "@/lib/guest-drafts";
import {
  listProjectFiles,
  listProjects,
  type SavedProject,
  type SavedProjectFile,
} from "@/lib/projects-client";
import type { Project, ProjectFile } from "./types";
import { getInitials, getProjectColor } from "./utils";

export function useDashboardData(user: User | undefined, sessionPending: boolean) {
  const [guestDrafts, setGuestDrafts] = useState<GuestProjectDraft[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [filesByProject, setFilesByProject] = useState<Record<string, SavedProjectFile[]>>({});
  const [savedProjectsLoading, setSavedProjectsLoading] = useState(false);
  const [savedProjectsLoaded, setSavedProjectsLoaded] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const expandInitRef = useRef(false);
  const isSignedIn = Boolean(user);

  useEffect(() => setGuestDrafts(listGuestProjectDrafts()), []);

  useEffect(() => {
    if (sessionPending || !user) return;
    let active = true;

    async function loadSavedProjects() {
      setSavedProjectsLoading(true);
      setSavedProjectsLoaded(false);
      try {
        const projects = await listProjects();
        if (!active) return;
        setSavedProjects(projects);
        const entries = await Promise.all(
          projects.map(async (project) => {
            try {
              return [project.id, await listProjectFiles(project.id)] as const;
            } catch {
              return [project.id, []] as const;
            }
          }),
        );
        if (active) setFilesByProject(Object.fromEntries(entries));
      } catch (error) {
        if (active) {
          toast.error(
            error instanceof Error && error.message !== "Internal Server Error"
              ? error.message
              : "Could not load saved projects.",
          );
        }
      } finally {
        if (active) {
          setSavedProjectsLoading(false);
          setSavedProjectsLoaded(true);
        }
      }
    }

    void loadSavedProjects();
    return () => {
      active = false;
    };
  }, [sessionPending, user]);

  const projects = useMemo<Project[]>(
    () =>
      (isSignedIn ? savedProjects : []).map((project, index) => {
        const realFiles = filesByProject[project.id] ?? [];
        const files: ProjectFile[] =
          realFiles.length > 0
            ? realFiles.map((file) => ({
                key: file.id,
                projectId: project.id,
                fileId: file.id,
                name: file.name,
                kind: file.type === "diagram" ? "diagram" : "doc",
              }))
            : [
                {
                  key: project.id,
                  projectId: project.id,
                  fileId: null,
                  name: "Your first design",
                  kind: "diagram",
                },
              ];
        return {
          id: project.id,
          name: project.name,
          initials: getInitials(project.name),
          color: getProjectColor(project.name),
          active: index === 0,
          source: "saved",
          files,
        };
      }),
    [filesByProject, isSignedIn, savedProjects],
  );
  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    return query
      ? projects.filter((project) => project.name.toLowerCase().includes(query))
      : projects;
  }, [projectSearch, projects]);

  useEffect(() => {
    if (expandInitRef.current || projects.length === 0) return;
    expandInitRef.current = true;
    setExpandedProjectId(projects[0].id);
  }, [projects]);

  return {
    expandedProjectId,
    filesByProject,
    filteredProjects,
    guestDrafts,
    isSignedIn,
    loading: sessionPending || (isSignedIn && !savedProjectsLoaded) || savedProjectsLoading,
    projectSearch,
    projects,
    savedProjects,
    setExpandedProjectId,
    setFilesByProject,
    setGuestDrafts,
    setProjectSearch,
    setSavedProjects,
    setSavedProjectsLoaded,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
