import { createPrivateMetadata } from "@/lib/site";

export const metadata = createPrivateMetadata("Project workspace");

export default function ProjectLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
