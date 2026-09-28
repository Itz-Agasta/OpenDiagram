"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getCreationQuota } from "@/lib/projects-client";

/**
 * Lands the verify link. The auth server's `sendVerificationEmail` hook points
 * every link at `/dashboard?verified=1`, and better-auth appends `&error=<code>`
 * when the token is expired or invalid (`api/routes/email-verification.mjs`,
 * `redirectOnError`). The credit count comes from the live quota rather than the
 * plan's signup grant, so a late verifier past their first month is told 5, not 25.
 */
export function VerifyEmailReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const verified = params.get("verified") === "1";
  const error = params.get("error");
  // Strict mode runs the effect twice in dev; one toast, not two.
  const handled = useRef(false);

  useEffect(() => {
    if (!verified || handled.current) return;
    handled.current = true;
    router.replace("/dashboard");

    if (error) {
      toast.error("That verification link didn't work.", {
        description: "Links expire after an hour. Send a fresh one from the banner.",
      });
      return;
    }
    getCreationQuota()
      .then((quota) =>
        toast.success("Email verified.", {
          description: `${quota.remaining} diagram credits are ready to use.`,
        }),
      )
      .catch(() => toast.success("Email verified."));
  }, [verified, error, router]);

  return null;
}
