export type Variant = "flow" | "sequence" | "cloud" | "erd" | "mindmap";

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

export function avatarColor(initials: string) {
  let hash = 0;

  for (const char of initials) {
    hash = (hash + char.charCodeAt(0)) % 4;
  }

  return ["#1a1a1a", "#262626", "#0cb300", "#737373"][hash];
}
