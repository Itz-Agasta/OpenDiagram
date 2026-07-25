"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { assetUrl } from "@/lib/site";
import { getInitials } from "@/components/dashboard/dashboard-page/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsHeader() {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link
        href="/dashboard"
        className="inline-flex min-w-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-od-ink/20"
        aria-label="OpenDiagram home"
      >
        <Image
          src={assetUrl("/brand/mascot.png")}
          alt=""
          width={36}
          height={36}
          className="size-8 shrink-0"
        />
        <span className="truncate text-[17px] font-semibold tracking-tight text-od-ink">
          OpenDiagram
        </span>
      </Link>

      <Link
        href="/dashboard"
        className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to dashboard
        <ArrowRight className="size-4" />
      </Link>
    </header>
  );
}

export function SettingsProfileCard() {
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user;
  const [signOutPending, setSignOutPending] = useState(false);

  async function signOut() {
    setSignOutPending(true);
    try {
      await authClient.signOut();
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSignOutPending(false);
    }
  }

  if (session.isPending) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-lg border p-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-9 w-24 shrink-0 rounded-md" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        <p>
          You&apos;re browsing as a guest.{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Sign in
          </Link>{" "}
          to manage BYOK keys on your account.
        </p>
      </div>
    );
  }

  const displayName = user.name?.trim() || user.email || "Account";
  const email = user.email?.trim() || null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border p-4">
      {user.image ? (
        <Image
          src={user.image}
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-full border border-od-border-soft object-cover"
        />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-od-ink text-sm font-semibold text-od-on-dark">
          {getInitials(displayName)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-od-ink">{displayName}</p>
        {email && email !== displayName ? (
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-od-ink-faint">Signed in · Default workspace</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        disabled={signOutPending}
        onClick={() => void signOut()}
      >
        <LogOut className="size-4" />
        {signOutPending ? "Signing out…" : "Log out"}
      </Button>
    </div>
  );
}
