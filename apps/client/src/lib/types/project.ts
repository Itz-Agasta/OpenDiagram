export interface Project {
  id: string;
  name: string;
  description: string | null;
  source?: string | null;
  sourceMetadata?: unknown | null;
  generationStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  source?: "manual" | "github_import";
  sourceMetadata?: unknown;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface RepositoryDocProvenance {
  kind: "repo_documentation";
  generated: true;
  generatorVersion: string;
  repoFullName: string;
  branch: string;
  commitSha: string | null;
  importedAt: string;
  sourcePaths: string[];
  userEditedAt: string | null;
}

export type DiagramType =
  | "system-design"
  | "sequence"
  | "erd"
  | "flowchart"
  | "bpmn"
  | "network"
  | "infra"
  | "cloud-architecture";

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  columns?: Array<{
    name: string;
    type?: string;
    key?: "pk" | "fk";
  }>;
  shape?: "rectangle" | "ellipse" | "diamond" | "cylinder" | "document";
  category?: string;
  style?: Record<string, any>;
}

export interface DiagramEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  style?: Record<string, any>;
}

export interface DiagramSpec {
  type: DiagramType;
  title: string;
  description?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups?: Array<Record<string, any>>;
  zones?: Array<Record<string, any>>;
  meta?: {
    theme?: "light" | "dark";
    direction?: "LR" | "TB" | "BT" | "RL";
  };
}

export interface ExcalidrawScene {
  elements?: any[];
  appState?: any;
  files?: Record<string, any>;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  type: "diagram" | "doc";
  name: string;
  scene?: ExcalidrawScene;
  spec?: DiagramSpec | RepositoryDocProvenance;
  content?: string;
  history?: any[];
  sceneRev?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectFileInput {
  name: string;
  type: "diagram" | "doc";
  scene?: ExcalidrawScene;
  spec?: DiagramSpec | RepositoryDocProvenance;
  content?: string;
  history?: any[];
}

export type UpdateProjectFileInput = Partial<CreateProjectFileInput>;
