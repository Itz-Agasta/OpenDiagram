"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getCreationQuota } from "@/lib/projects-client";

/**
 * Lands the verify link. The auth server's `sendVerificationEmail` hook points
 * every link at `/dashboard?verified=1`, and better-auth appends `&error=<code>`
 * when the token is expired or invalid (`api/routes/email-verification.mjs`,
 * `redirectOnError`). `verified=1` is only a marker anyone can type, so success
 * is read off the live quota: still on the guest plan means not verified. The
 * count comes from there too, so a late verifier past their first month is told
 * 5, not 25.
 */
export function VerifyEmailReturn() {
  const params = useSearchParams();
  const verified = params.get("verified") === "1";
  const error = params.get("error");
  // Strict mode runs the effect twice in dev; one toast, not two.
  const handled = useRef(false);
  // Unmount only. The effect's own cleanup also fires when replaceState below
  // clears `verified`, which would cancel the toast it is waiting to show.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!verified || handled.current) return;
    handled.current = true;
    // Native history, not router.replace: this only drops the marker, and
    // Next keeps useSearchParams in sync without re-rendering the route.
    window.history.replaceState(null, "", "/dashboard");

    if (error) {
      toast.error("That verification link didn't work.", {
        description: "Links expire after an hour. Send a fresh one from the banner.",
      });
      return;
    }
    getCreationQuota()
      .then((quota) => {
        if (!mounted.current || quota.planId === "guest") return;
        toast.success("Email verified.", {
          description: `${quota.remaining} diagram credits are ready to use.`,
        });
      })
      .catch(() => {});
  }, [verified, error]);

  return null;
}
