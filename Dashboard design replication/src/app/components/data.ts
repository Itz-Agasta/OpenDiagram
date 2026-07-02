import type { Variant } from "./diagram-thumb";

export type Template = {
  id: string;
  title: string;
  desc: string;
  variant: Variant;
  ai?: boolean;
};

export const templates: Template[] = [
  {
    id: "t-ai",
    title: "AI diagram",
    desc: "Describe it, get a diagram",
    variant: "mindmap",
    ai: true,
  },
  { id: "t-flow", title: "Flowchart", desc: "Logic and decision flows", variant: "flow" },
  { id: "t-seq", title: "Sequence", desc: "Request lifecycles", variant: "sequence" },
  { id: "t-cloud", title: "Cloud architecture", desc: "Infra and services", variant: "cloud" },
  { id: "t-erd", title: "Entity relationship", desc: "Schemas and tables", variant: "erd" },
];

export type DiagramFile = {
  id: string;
  title: string;
  folder: string;
  variant: Variant;
  edited: string;
  collaborators: string[];
  live?: boolean;
  starred?: boolean;
};

export const files: DiagramFile[] = [
  {
    id: "d1",
    title: "Payments service topology",
    folder: "Platform Architecture",
    variant: "cloud",
    edited: "2 hours ago",
    collaborators: ["ML", "JR", "AK"],
    live: true,
    starred: true,
  },
  {
    id: "d2",
    title: "Checkout request lifecycle",
    folder: "API Design",
    variant: "sequence",
    edited: "Yesterday",
    collaborators: ["JR", "TP"],
  },
  {
    id: "d3",
    title: "Order state machine",
    folder: "Platform Architecture",
    variant: "flow",
    edited: "2 days ago",
    collaborators: ["ML"],
    starred: true,
  },
  {
    id: "d4",
    title: "Billing database schema",
    folder: "API Design",
    variant: "erd",
    edited: "3 days ago",
    collaborators: ["AK", "TP", "JR"],
  },
  {
    id: "d5",
    title: "Service dependency map",
    folder: "Infra & Cloud",
    variant: "mindmap",
    edited: "Last week",
    collaborators: ["ML", "AK"],
    live: true,
  },
  {
    id: "d6",
    title: "Auth gateway flow",
    folder: "Platform Architecture",
    variant: "flow",
    edited: "Last week",
    collaborators: ["TP"],
  },
  {
    id: "d7",
    title: "Event bus architecture",
    folder: "Infra & Cloud",
    variant: "cloud",
    edited: "2 weeks ago",
    collaborators: ["JR", "ML", "AK"],
  },
  {
    id: "d8",
    title: "Webhook delivery sequence",
    folder: "API Design",
    variant: "sequence",
    edited: "3 weeks ago",
    collaborators: ["AK"],
  },
];

const avatarColors: Record<string, string> = {
  ML: "#1a1a1a",
  JR: "#262626",
  AK: "#0cb300",
  TP: "#737373",
};

export function avatarColor(initials: string) {
  return avatarColors[initials] ?? "#1a1a1a";
}
