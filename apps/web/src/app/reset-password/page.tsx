import { Suspense } from "react";
import { createPrivateMetadata } from "@/lib/site";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Not indexed: this is only ever reached from a mailed link or the sign-in page.
export const metadata = createPrivateMetadata("Reset password");

export default function ResetPasswordPage() {
  return (
    <main className="auth-root">
      <Suspense fallback={<div className="text-[13px] text-od-ink-faint">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
