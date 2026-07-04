import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-od-canvas px-4 py-12">
      <Suspense fallback={<div className="text-[13px] text-od-ink-faint">Loading…</div>}>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  );
}
