"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getCreationQuota, type CreationQuota } from "@/lib/projects-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISSED_KEY = "opendiagram:guest-welcome-dismissed";

export function GuestWelcomeDialog() {
  const pathname = usePathname();
  const session = authClient.useSession();
  const initialSessionResolved = useRef(false);
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState<CreationQuota | null>(null);
  const [quotaPending, setQuotaPending] = useState(false);

  useEffect(() => {
    if (session.isPending || initialSessionResolved.current) return;
    initialSessionResolved.current = true;
    if (session.data?.user) return;

    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "true";
    if (!dismissed) setOpen(true);
  }, [session.data?.user, session.isPending]);

  useEffect(() => {
    if (!open || session.data?.user) return;
    let cancelled = false;
    setQuotaPending(true);
    void getCreationQuota()
      .then((nextQuota) => {
        if (!cancelled) setQuota(nextQuota);
      })
      .catch(() => {
        // Keep the fallback copy when quota is unavailable; opening the dialog
        // should never produce an unhandled client-side rejection.
      })
      .finally(() => {
        if (!cancelled) setQuotaPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, session.data?.user]);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  }

  const loginHref = `/login?redirect=${encodeURIComponent(pathname)}`;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : dismiss())}>
      <DialogContent className="overflow-hidden border-od-border-soft bg-white p-0 sm:max-w-[520px]">
        <div className="border-b border-od-border-soft bg-[#fff7f4] px-6 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <Image
              src="/new_logo.png"
              alt="OpenDiagram logo"
              width={44}
              height={44}
              className="size-11"
            />
            <div>
              <p className="text-[18px] font-semibold tracking-[-0.02em] text-od-ink">
                OpenDiagram
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#c53f29]">
                Vibe diagrams
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 pb-6 pt-2 sm:px-7 sm:pb-7">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-[24px] leading-[1.15] tracking-[-0.03em] text-od-ink">
              Use OpenDiagram your way
            </DialogTitle>
            <DialogDescription className="text-[14px] leading-6 text-od-ink-muted">
              Log in to use your own AI provider keys with OpenDiagram.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="flex gap-3">
              <KeyRound className="mt-0.5 size-5 shrink-0 text-od-ink" aria-hidden />
              <div>
                <p className="text-[14px] font-semibold text-od-ink">Your keys, your providers</p>
                <p className="mt-1 text-[13px] leading-5 text-od-ink-muted">
                  Sign in to connect your own keys and choose the models you want to use.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-[#df4a31]" aria-hidden />
              <div>
                <p className="text-[14px] font-semibold text-od-ink">Free guest access</p>
                <p className="mt-1 text-[13px] leading-5 text-od-ink-muted">
                  Guest users can still use our free platform credits. Each AI generation consumes
                  your guest quota.
                </p>
                <p aria-live="polite" className="mt-2 text-[12px] font-medium text-od-ink">
                  {quotaPending
                    ? "Checking your platform quota…"
                    : quota
                      ? `${quota.remaining} of ${quota.limit} free creation requests remaining`
                      : "Your platform quota will appear here."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11 flex-1 cursor-pointer">
              <Link href={loginHref} onClick={dismiss}>
                Log in to use your keys
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 cursor-pointer"
              onClick={dismiss}
            >
              Continue with free credits
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
