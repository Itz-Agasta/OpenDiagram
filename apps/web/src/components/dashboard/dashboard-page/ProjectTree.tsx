import { ChevronDown, Pencil, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project, ProjectFile } from "./types";
import { getFileIcon } from "./utils";

export interface ProjectTreeProps {
  editingFileKey: string | null;
  editingProjectId: string | null;
  expandedProjectId: string | null;
  filteredProjects: Project[];
  loading: boolean;
  nameDraft: string;
  onBeginEditFile: (file: ProjectFile) => void;
  onBeginEditProject: (project: Project) => void;
  onCancelEdit: () => void;
  onCommitFile: (file: ProjectFile) => void;
  onCommitProject: (project: Project) => void;
  onCreateFile: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenFile: (file: ProjectFile) => void;
  onOpenProject: (project: Project) => void;
  onToggleProject: (projectId: string) => void;
  projects: Project[];
  setNameDraft: (name: string) => void;
}

export function ProjectTree(props: ProjectTreeProps) {
  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
      <div className="mb-2 flex items-center justify-between rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-od-ink-faint">
        Projects
        <ChevronDown className="h-3.5 w-3.5" />
      </div>
      <div className="min-h-0 overflow-y-auto pb-4">
        {props.loading ? (
          <ProjectSkeletons />
        ) : props.projects.length === 0 ? (
          <button
            type="button"
            onClick={props.onCreateProject}
            className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[13px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Your first project
          </button>
        ) : props.filteredProjects.length === 0 ? (
          <p className="px-2 py-2 text-[13px] text-od-ink-faint">No projects found.</p>
        ) : (
          props.filteredProjects.map((project) => (
            <ProjectRow key={project.id} project={project} {...props} />
          ))
        )}
        {!props.loading && props.projects.length > 0 && (
          <button
            type="button"
            onClick={props.onCreateProject}
            className="mt-1 flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] text-od-ink-faint opacity-0 transition hover:bg-od-canvas/45 hover:text-od-ink focus-visible:opacity-100 group-hover/dashboard-sidebar:opacity-100"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            New project
          </button>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, ...props }: ProjectTreeProps & { project: Project }) {
  const expanded = props.expandedProjectId === project.id;
  return (
    <div className="mb-1">
      <div
        className={`group/prow flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-[14px] transition ${project.active ? "bg-od-canvas/70 text-od-ink" : "text-od-ink-muted hover:bg-od-canvas/45"}`}
      >
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-semibold text-white"
          style={{ backgroundColor: project.color }}
        >
          {project.initials}
        </span>
        {props.editingProjectId === project.id ? (
          <EditInput
            value={props.nameDraft}
            onChange={props.setNameDraft}
            onCommit={() => props.onCommitProject(project)}
            onCancel={props.onCancelEdit}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => props.onOpenProject(project)}
              className="min-w-0 flex-1 cursor-pointer truncate text-left"
            >
              {project.name}
            </button>
            <button
              type="button"
              onClick={() => props.onBeginEditProject(project)}
              aria-label="Rename project"
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-od-ink-faint opacity-0 transition hover:bg-od-canvas/60 hover:text-od-ink group-hover/prow:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => props.onToggleProject(project.id)}
              aria-label={expanded ? "Collapse" : "Expand"}
              aria-expanded={expanded}
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`}
              />
            </button>
          </>
        )}
      </div>
      {expanded && (
        <div className="mt-1 grid gap-0.5 pl-5">
          {project.files.map((file) => (
            <FileRow key={file.key} file={file} {...props} />
          ))}
          <button
            type="button"
            onClick={() => props.onCreateFile(project.id)}
            className="flex h-7 items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            New file
          </button>
        </div>
      )}
    </div>
  );
}

function FileRow({ file, ...props }: ProjectTreeProps & { file: ProjectFile }) {
  const Icon = getFileIcon(file.kind);
  return (
    <div className="group/file flex h-7 items-center gap-2 rounded-[7px] px-2 text-[12px] text-od-ink-muted transition hover:bg-od-canvas/45 hover:text-od-ink">
      <Icon className="h-3.5 w-3.5 shrink-0 text-od-ink-faint" />
      {props.editingFileKey === file.key ? (
        <EditInput
          value={props.nameDraft}
          onChange={props.setNameDraft}
          onCommit={() => props.onCommitFile(file)}
          onCancel={props.onCancelEdit}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => props.onOpenFile(file)}
            className="min-w-0 flex-1 cursor-pointer truncate text-left"
          >
            {file.name}
          </button>
          {file.fileId && (
            <button
              type="button"
              onClick={() => props.onBeginEditFile(file)}
              aria-label="Rename file"
              className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[5px] text-od-ink-faint opacity-0 transition hover:bg-od-canvas/60 hover:text-od-ink group-hover/file:opacity-100"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function EditInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        else if (event.key === "Escape") onCancel();
      }}
      className="min-w-0 flex-1 rounded-[5px] border border-od-border-soft bg-white px-1.5 py-0.5 text-[12px] text-od-ink outline-none focus:border-od-ink"
    />
  );
}

function ProjectSkeletons() {
  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-[5px]" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}
