import { createPrivateMetadata } from "@/lib/site";

export const metadata = createPrivateMetadata("Settings");

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
