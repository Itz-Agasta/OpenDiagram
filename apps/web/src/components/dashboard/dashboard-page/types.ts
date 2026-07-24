export type FileKind = "diagram" | "doc";

export interface ProjectFile {
  key: string;
  projectId: string;
  fileId: string | null;
  name: string;
  kind: FileKind;
}

export interface Project {
  id: string;
  name: string;
  initials: string;
  color: string;
  active: boolean;
  files: ProjectFile[];
  source: "guest" | "saved";
}

export interface AgentInputSubmit {
  prompt: string;
  kind: FileKind;
  providerId?: string;
  modelId?: string;
}
