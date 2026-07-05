import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-root">
      <Suspense fallback={<div className="text-[13px] text-od-ink-faint">Loading…</div>}>
        <AuthForm initialTab="signin" />
      </Suspense>
    </main>
  );
}
