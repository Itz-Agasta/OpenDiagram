import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, sessionQueryOptions } from "#/lib/api";
import { getInitials } from "#/lib/utils";
import { CustomButton } from "#/components/ui/button";
import { useKumoToastManager } from "@cloudflare/kumo";

export function SettingsHeader() {
  return (
    <header className="mb-8 flex items-center justify-between gap-4 font-geist">
      <Link
        to="/App"
        className="inline-flex min-w-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-gray-900/20"
        aria-label="OpenDiagram home"
      >
        <img src="/mascot.png" alt="" width={36} height={36} className="size-8 shrink-0" />
        <span className="truncate text-[17px] font-semibold tracking-tight text-gray-900 heading-font">
          OpenDiagram
        </span>
      </Link>

      <Link
        to="/App"
        className="inline-flex shrink-0 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 body-font font-medium"
      >
        Back to dashboard
        <ArrowRight className="size-4" />
      </Link>
    </header>
  );
}

export function SettingsProfileCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toastManager = useKumoToastManager();
  const { data: session, isPending } = useQuery(sessionQueryOptions);
  const user = session?.user;
  const [signOutPending, setSignOutPending] = useState(false);

  async function signOut() {
    setSignOutPending(true);
    try {
      await authClient.signOut();
      queryClient.clear();
      toastManager.add({
        title: "Signed out",
        description: "You have been successfully signed out.",
        variant: "success",
      });
      void navigate({ to: "/login" as unknown as "/login" });
    } catch (err: unknown) {
      toastManager.add({
        title: "Error signing out",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "error",
      });
    } finally {
      setSignOutPending(false);
    }
  }

  if (isPending) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-200/80 bg-white p-4 font-geist">
        <div className="size-12 rounded-full bg-gray-100 animate-pulse shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-40 bg-gray-100 animate-pulse rounded" />
          <div className="h-3 w-56 bg-gray-100 animate-pulse rounded" />
        </div>
        <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-md shrink-0" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-gray-200/80 bg-white px-4 py-3 text-sm text-gray-500 font-geist body-font">
        <p>
          You&apos;re browsing as a guest.{" "}
          <Link
            to="/login"
            className="font-medium text-gray-900 underline underline-offset-2 hover:text-blue-600"
          >
            Sign in
          </Link>{" "}
          to manage keys and settings on your account.
        </p>
      </div>
    );
  }

  const displayName = user.name?.trim() || user.email || "Account";
  const email = user.email?.trim() || null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-200/80 bg-white p-4 font-geist">
      {user.image ? (
        <img
          src={user.image}
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-full border border-gray-200/50 object-cover"
        />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-gray-900 text-sm font-semibold text-white uppercase">
          {getInitials(displayName)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-gray-900 body-font">{displayName}</p>
        {email && email !== displayName ? (
          <p className="truncate text-sm text-gray-500 mt-0.5">{email}</p>
        ) : null}
        <p className="mt-1 text-xs text-gray-400">Signed in · Default workspace</p>
      </div>
      <CustomButton
        type="button"
        disabled={signOutPending}
        onClick={() => void signOut()}
        text={signOutPending ? "Signing out…" : "Log out"}
        className="shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 font-geist"
      />
    </div>
  );
}
