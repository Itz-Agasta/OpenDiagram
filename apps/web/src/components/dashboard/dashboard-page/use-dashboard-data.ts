import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "better-auth";
import { listGuestProjectDrafts, type GuestProjectDraft } from "@/lib/guest-drafts";
import {
  listProjectsWithFiles,
  type DashboardProjects,
  type SavedProject,
  type SavedProjectFile,
} from "@/lib/projects-client";
import type { Project, ProjectFile } from "./types";
import { getInitials, getProjectColor } from "./utils";

const dashboardProjectsKey = ["dashboard", "projects"] as const;
const emptyDashboard: DashboardProjects = { projects: [], filesByProject: {} };

export function useDashboardData(user: User | undefined, sessionPending: boolean) {
  const queryClient = useQueryClient();
  const [guestDrafts, setGuestDrafts] = useState<GuestProjectDraft[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const expandInitRef = useRef(false);
  const isSignedIn = Boolean(user);

  // Hydration guard. Two of this hook's inputs only exist in the browser:
  // `useSession` can resolve synchronously from its client store, and guest drafts
  // come from localStorage via the effect below. So the server renders skeletons
  // while the client's first render already knows there are no projects, and React
  // reports a mismatch on the empty-state button in ProjectTree.
  //
  // Reporting `loading` until after mount makes the first client render identical
  // to the server's. Safe because `loading` only ever selects a skeleton.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Async now that drafts are durable: the read waits on the one IndexedDB
  // hydration. `cancelled` guards the late resolve against an unmount.
  useEffect(() => {
    let cancelled = false;
    void listGuestProjectDrafts().then((drafts) => {
      if (!cancelled) setGuestDrafts(drafts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // One request for the whole tree, replacing a `listProjects` followed by a
  // `listProjectFiles` per project. `enabled` holds it until the session has
  // resolved, and keeps it off entirely for a visitor who only has local drafts.
  const query = useQuery({
    queryKey: dashboardProjectsKey,
    queryFn: listProjectsWithFiles,
    enabled: !sessionPending && isSignedIn,
  });

  const { error } = query;
  useEffect(() => {
    if (!error) return;
    toast.error(
      error instanceof Error && error.message !== "Internal Server Error"
        ? error.message
        : "Could not load saved projects.",
    );
  }, [error]);

  const savedProjects = query.data?.projects ?? emptyDashboard.projects;
  const filesByProject = query.data?.filesByProject ?? emptyDashboard.filesByProject;

  // Creation and renaming apply their results optimistically rather than
  // refetching the tree, so these keep the `useState` setter shape those hooks
  // were written against and write straight into the query cache instead.
  const setSavedProjects = useCallback<Dispatch<SetStateAction<SavedProject[]>>>(
    (update) => {
      queryClient.setQueryData<DashboardProjects>(dashboardProjectsKey, (current) => {
        const base = current ?? emptyDashboard;
        return { ...base, projects: typeof update === "function" ? update(base.projects) : update };
      });
    },
    [queryClient],
  );

  const setFilesByProject = useCallback<
    Dispatch<SetStateAction<Record<string, SavedProjectFile[]>>>
  >(
    (update) => {
      queryClient.setQueryData<DashboardProjects>(dashboardProjectsKey, (current) => {
        const base = current ?? emptyDashboard;
        return {
          ...base,
          filesByProject: typeof update === "function" ? update(base.filesByProject) : update,
        };
      });
    },
    [queryClient],
  );

  /** Drop the signed-in tree on sign-out so the next account cannot see it. */
  const resetSavedProjects = useCallback(() => {
    queryClient.removeQueries({ queryKey: dashboardProjectsKey });
  }, [queryClient]);

  const projects = useMemo<Project[]>(
    () =>
      (isSignedIn ? savedProjects : guestDrafts).map((project, index) => {
        const isGuest = !isSignedIn;
        const realFiles = isGuest ? [] : (filesByProject[project.id] ?? []);
        const guestFiles = isGuest ? (project as GuestProjectDraft).files : [];
        const files: ProjectFile[] = isGuest
          ? guestFiles.map((file) => ({
              key: file.id,
              projectId: project.id,
              fileId: file.id,
              name: file.name,
              kind: file.type === "diagram" ? "diagram" : "doc",
            }))
          : realFiles.length > 0
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
          source: isGuest ? "guest" : "saved",
          files,
        };
      }),
    [filesByProject, guestDrafts, isSignedIn, savedProjects],
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
    // A disabled query reports `isPending` forever, so this only counts it once
    // the caller is signed in and the request is genuinely in flight.
    loading: !mounted || sessionPending || (isSignedIn && query.isPending),
    projectSearch,
    projects,
    resetSavedProjects,
    savedProjects,
    setExpandedProjectId,
    setFilesByProject,
    setGuestDrafts,
    setProjectSearch,
    setSavedProjects,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
