import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { createPrivateMetadata } from "@/lib/site";

export const metadata = createPrivateMetadata("Sign up");

export default function SignupPage() {
  return (
    <main className="auth-root">
      <Suspense fallback={<div className="text-[13px] text-od-ink-faint">Loading…</div>}>
        <AuthForm initialTab="signup" />
      </Suspense>
    </main>
  );
}
