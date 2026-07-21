import { createPrivateMetadata } from "@/lib/site";

export const metadata = createPrivateMetadata("Dashboard");

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
