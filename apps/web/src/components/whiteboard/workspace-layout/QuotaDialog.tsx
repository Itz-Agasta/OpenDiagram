"use client";

import Link from "next/link";
import { KeyRound, MailCheck, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { CreationQuotaError } from "@/lib/projects-client";
import { useResendVerification } from "@/components/auth/verify-email-banner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type QuotaDialogProps = {
  error: CreationQuotaError | null;
  byokSettingsHref: string;
  onClose: () => void;
};

export function QuotaDialog({ error, byokSettingsHref, onClose }: QuotaDialogProps) {
  const sessionUser = authClient.useSession().data?.user;
  // Only the guest allowance is gated on verification. An unverified account on
  // a paid plan that runs out still needs the upgrade path, not a resend.
  const verifyEmail =
    sessionUser && !sessionUser.emailVerified && error?.quota?.planId === "guest"
      ? sessionUser.email
      : undefined;
  const verification = useResendVerification(verifyEmail);

  return (
    <Dialog
      open={error !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="border-od-border-soft bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-od-ink">
            {verifyEmail ? "Verify your email to keep going" : "You've used your creation credits"}
          </DialogTitle>
          <DialogDescription className="leading-6 text-od-ink-muted">
            {verification.state === "sent" && verifyEmail
              ? `New link sent to ${verifyEmail}. It expires in an hour.`
              : error?.message}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {/* Ordered by what actually converts: paying is the primary path now
              that billing ships, and BYOK is the free alternative we promise
              forever. An unverified account is one click from its signup
              grant, so that click replaces the upsell. */}
          {verifyEmail ? (
            <button
              type="button"
              onClick={() => void verification.resend()}
              disabled={verification.state === "sending" || verification.state === "sent"}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-od-ink px-4 text-sm font-medium text-od-on-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MailCheck className="size-4" />
              {verification.state === "sending"
                ? "Sending..."
                : verification.state === "error"
                  ? "Couldn't send. Try again"
                  : "Resend verification link"}
            </button>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-od-ink px-4 text-sm font-medium text-od-on-dark transition-opacity hover:opacity-90"
            >
              <Sparkles className="size-4" />
              Upgrade to Pro
            </Link>
          )}
          <Link
            href={byokSettingsHref}
            className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-od-border-soft bg-white px-4 text-sm font-medium text-od-ink transition-colors hover:bg-od-canvas/45"
          >
            <KeyRound className="size-4" />
            Use your own AI key - free, unlimited
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
