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

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
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
  style?: "solid" | "dashed" | "dotted";
  startArrowhead?: "none" | "arrow" | "circle" | "bar";
  endArrowhead?: "none" | "arrow" | "circle" | "bar";
}

export interface DiagramGroup {
  id: string;
  label: string;
  sublabel?: string;
  contains: string[];
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
