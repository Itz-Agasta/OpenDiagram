"use client";

import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getCreationQuota } from "@/lib/projects-client";

/** Sends a fresh verify link; the old one expires after an hour. */
export function useResendVerification(email: string | undefined) {
  // Keyed by address so a sign-out and sign-in as someone else starts idle,
  // and a reply for the previous account lands on a key nobody reads.
  const [result, setResult] = useState<{ email: string; state: ResendState } | null>(null);
  const state: ResendState = result && result.email === email ? result.state : "idle";

  async function resend() {
    if (!email) return;
    setResult({ email, state: "sending" });
    try {
      const { error } = await authClient.sendVerificationEmail({ email });
      setResult({ email, state: error ? "error" : "sent" });
    } catch {
      setResult({ email, state: "error" });
    }
  }
  return { state, resend };
}

type ResendState = "idle" | "sending" | "sent" | "error";

/**
 * Until the email is verified the account runs on the guest allowance. The
 * sidebar quota sits behind a menu and the verify link expires after an hour,
 * so this stays up until they verify, with the one control that gets them a
 * fresh link.
 */
export function VerifyEmailBanner() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const unverified = Boolean(user && !user.emailVerified);
  const [credits, setCredits] = useState<number | null>(null);
  const { state, resend } = useResendVerification(user?.email);

  useEffect(() => {
    if (!unverified) return;
    let live = true;
    getCreationQuota()
      .then((quota) => {
        if (live) setCredits(quota.signupCredits ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [unverified]);

  if (!user || !unverified) return null;

  const unlock = credits ? `${credits} diagram credits` : "your free diagram credits";

  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-[680px] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-od-border-soft bg-od-surface-elevated px-4 py-3 text-[13px] text-od-ink"
    >
      <MailCheck className="h-4 w-4 shrink-0 text-od-ink-muted" />
      <p className="min-w-0 flex-1">
        {state === "sent" ? (
          <>
            New link sent to <span className="font-semibold">{user.email}</span>. It expires in an
            hour.
          </>
        ) : state === "error" ? (
          "We couldn't send the email. Try again in a minute."
        ) : (
          <>
            Verify <span className="font-semibold">{user.email}</span> to unlock {unlock}.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => void resend()}
        disabled={state === "sending" || state === "sent"}
        className="shrink-0 rounded-full border border-od-border-soft bg-white px-3 py-1 text-[12px] font-semibold text-od-ink transition hover:bg-od-surface disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "sending" ? "Sending..." : "Resend link"}
      </button>
    </div>
  );
}
