import { createPrivateMetadata } from "@/lib/site";

export const metadata = createPrivateMetadata("Sign in");

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
