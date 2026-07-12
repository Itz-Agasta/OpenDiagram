export type DiagramType =
  | "system-design"
  | "sequence"
  | "erd"
  | "flowchart"
  | "bpmn"
  | "network"
  | "infra"
  | "cloud-architecture";

export interface DiagramSpec {
  type: DiagramType;
  title: string;
  description?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
  zones?: DiagramZone[];
  meta?: {
    theme?: "light" | "dark";
    direction?: "LR" | "TB" | "BT" | "RL";
  };
}

export interface EntityColumn {
  name: string;
  type?: string;
  key?: "pk" | "fk";
}

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  /** ERD only: table columns rendered as rows inside the entity box. */
  columns?: EntityColumn[];
  shape?: "rectangle" | "ellipse" | "diamond" | "cylinder" | "document";
  category?:
    | "service"
    | "database"
    | "queue"
    | "gateway"
    | "client"
    | "external"
    | "storage"
    | "cache"
    | "function"
    | "user";
  style?: {
    strokeColor?: string;
    backgroundColor?: string;
    strokeStyle?: "solid" | "dashed" | "dotted";
    strokeWidth?: number;
  };
}

export interface DiagramEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  protocol?: string;
  direction?: "uni" | "bi";
  /** Semantic connection type — the renderer maps it to a stroke style ("error" draws red, "success" green). */
  kind?: "sync" | "async" | "replication" | "error" | "success";
  /** ERD only: relationship cardinality — the renderer maps it to crow-foot arrowheads. */
  cardinality?: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  /** @deprecated prefer `kind`; kept as explicit stroke override. */
  style?: "solid" | "dashed" | "dotted";
  startArrowhead?: "none" | "arrow" | "circle" | "bar";
  endArrowhead?: "none" | "arrow" | "circle" | "bar";
}

export interface DiagramGroup {
  id: string;
  label: string;
  sublabel?: string;
  contains: string[];
  /**
   * Sequence fragments only: alt/else branch sections inside one fragment box.
   * Each section starts at the given message edge id; the renderer draws a
   * dashed divider between sections and a small [label] per branch.
   */
  sections?: { label: string; startsAt: string }[];
  style?: "vpc" | "region" | "subnet" | "cluster" | "swimlane" | "box";
  strokeColor?: string;
  backgroundColor?: string;
}

export interface DiagramZone {
  id: string;
  label: string;
  contains: string[];
  style?: "aws-region" | "gcp-region" | "availability-zone" | "boundary";
}
