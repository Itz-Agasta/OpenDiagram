import { createPrivateMetadata } from "@/lib/site";

export const metadata = createPrivateMetadata("Import a repository");

export default function ImportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
