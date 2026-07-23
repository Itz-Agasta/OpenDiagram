import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogIn, LogOut, PanelLeftClose, Settings } from "lucide-react";
import { GithubLogoIcon } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCreationQuota, type CreationQuota } from "@/lib/projects-client";
import { getInitials } from "./helpers";

const QUOTA_CACHE_TTL_MS = 15_000;

type WorkspaceSidebarAccountProps = {
  accountImage?: string | null;
  accountName: string;
  isSignedIn: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

export function WorkspaceSidebarAccount(props: WorkspaceSidebarAccountProps) {
  const [quota, setQuota] = useState<CreationQuota | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaPending, setQuotaPending] = useState(false);
  const quotaCacheRef = useRef<{ quota: CreationQuota; fetchedAt: number } | null>(null);
  const quotaRequestRef = useRef<Promise<CreationQuota> | null>(null);
  const quotaPercent = quota?.limit
    ? Math.max(0, Math.min(100, (quota.remaining / quota.limit) * 100))
    : 0;

  async function handleMenuOpen(open: boolean) {
    if (!open) return;
    const cached = quotaCacheRef.current;
    if (cached && Date.now() - cached.fetchedAt < QUOTA_CACHE_TTL_MS) {
      setQuotaError(null);
      setQuota(cached.quota);
      return;
    }
    if (quotaRequestRef.current) return;

    setQuotaPending(true);
    setQuotaError(null);
    const request = getCreationQuota();
    quotaRequestRef.current = request;
    try {
      const nextQuota = await request;
      quotaCacheRef.current = { quota: nextQuota, fetchedAt: Date.now() };
      setQuota(nextQuota);
    } catch (error) {
      setQuotaError(error instanceof Error ? error.message : "Could not load quota.");
    } finally {
      if (quotaRequestRef.current === request) quotaRequestRef.current = null;
      setQuotaPending(false);
    }
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-od-border-soft px-3">
      <Link
        href="/dashboard"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-od-border-soft text-od-ink-faint transition hover:bg-od-canvas/45 hover:text-od-ink"
        aria-label="Back to dashboard"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      {props.isSignedIn &&
        (props.accountImage ? (
          <img
            src={props.accountImage}
            alt=""
            className="h-8 w-8 rounded-[8px] border border-od-border-soft object-cover"
          />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-[8px] bg-od-ink text-[12px] font-semibold text-od-on-dark">
            {getInitials(props.accountName)}
          </div>
        ))}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{props.accountName}</p>
        <p className="truncate text-[11px] text-od-ink-faint">
          {props.isSignedIn ? "Signed in" : "Guest session"}
        </p>
      </div>
      <DropdownMenu onOpenChange={(open) => void handleMenuOpen(open)}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account actions"
            className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
          >
            <Settings className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" sideOffset={24} align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-1.5 px-2 py-2">
              <span className="block text-[12px] font-semibold text-od-ink">Beta quota</span>
              <span aria-live="polite" className="block text-[11px] font-normal leading-4">
                {quotaPending ? (
                  <span className="text-od-ink-faint">Loading…</span>
                ) : quotaError ? (
                  <span className="text-red-600">{quotaError}</span>
                ) : quota ? (
                  <span className="text-od-ink-muted">
                    {quota.remaining} of {quota.limit} creation requests left
                    {quota.actorType === "guest" ? ". Sign in to get 10." : "."}
                  </span>
                ) : (
                  <span className="text-od-ink-faint">Open settings to check usage.</span>
                )}
              </span>
              {quota && (
                <div
                  role="progressbar"
                  aria-label={`${quota.remaining} of ${quota.limit} beta creation requests left`}
                  aria-valuemin={0}
                  aria-valuemax={quota.limit}
                  aria-valuenow={quota.remaining}
                  className="h-1.5 overflow-hidden rounded-full bg-od-canvas"
                >
                  <div
                    className="h-full rounded-full bg-od-ink"
                    style={{ width: `${quotaPercent}%` }}
                  />
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {props.isSignedIn ? (
              <>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/import/github">
                    <GithubLogoIcon size={16} weight="regular" />
                    Connect GitHub
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    AI settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={props.onSignOut} className="cursor-pointer">
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={props.onSignIn} className="cursor-pointer">
                <LogIn className="h-4 w-4" />
                Sign in
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={props.onClose}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
        aria-label="Collapse file explorer"
      >
        <PanelLeftClose className="h-4 w-4" />
      </button>
    </div>
  );
}
