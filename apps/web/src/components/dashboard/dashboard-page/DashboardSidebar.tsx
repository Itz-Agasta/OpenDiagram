import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogIn, LogOut, Search, Settings } from "lucide-react";
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
import {
  creationQuotaColorClass,
  getCreationQuota,
  type CreationQuota,
} from "@/lib/projects-client";
import { ProjectTree, type ProjectTreeProps } from "./ProjectTree";
import { getInitials } from "./utils";

interface DashboardSidebarProps extends ProjectTreeProps {
  accountImage?: string | null;
  accountName: string;
  isSignedIn: boolean;
  onSignOut: () => void;
  projectSearch: string;
  setProjectSearch: (search: string) => void;
  signOutPending: boolean;
}

export function DashboardSidebar(props: DashboardSidebarProps) {
  return (
    <aside className="group/dashboard-sidebar hidden h-full w-[288px] shrink-0 border-r border-od-border-soft bg-od-surface text-od-ink lg:flex lg:flex-col">
      <Link
        href="/"
        aria-label="OpenDiagram home"
        className="flex h-16 shrink-0 items-center gap-2 px-4 text-[20px] font-semibold leading-tight"
      >
        <Image src="/new_logo.png" alt="" width={28} height={28} className="size-7 shrink-0" />
        <span className="truncate">OpenDiagram</span>
      </Link>
      <div className="px-3 py-3">
        <label className="flex h-9 items-center gap-2 rounded-full border border-od-border-soft bg-od-surface-elevated px-3 text-[13px] text-od-ink-faint focus-within:border-od-ink">
          <Search className="h-4 w-4" />
          <span className="sr-only">Search projects</span>
          <input
            type="search"
            placeholder="Search"
            value={props.projectSearch}
            onChange={(event) => props.setProjectSearch(event.target.value)}
            className="w-full bg-transparent text-od-ink outline-none placeholder:text-od-ink-faint"
          />
        </label>
      </div>
      <ProjectTree {...props} />
      <div className="flex h-16 shrink-0 items-center gap-3 border-t border-od-border-soft px-4">
        {props.isSignedIn &&
          (props.accountImage ? (
            <img
              src={props.accountImage}
              alt=""
              className="h-9 w-9 rounded-full border border-od-border-soft object-cover"
            />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-full bg-od-ink text-[13px] font-semibold text-od-on-dark">
              {getInitials(props.accountName)}
            </div>
          ))}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{props.accountName}</p>
          <p className="truncate text-[12px] text-od-ink-faint">Default workspace</p>
        </div>
        <AccountMenu
          isSignedIn={props.isSignedIn}
          onSignOut={props.onSignOut}
          pending={props.signOutPending}
        />
      </div>
    </aside>
  );
}

function AccountMenu({
  isSignedIn,
  onSignOut,
  pending,
}: {
  isSignedIn: boolean;
  onSignOut: () => void;
  pending: boolean;
}) {
  const [quota, setQuota] = useState<CreationQuota | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaPending, setQuotaPending] = useState(false);
  const quotaCacheRef = useRef<{ quota: CreationQuota; fetchedAt: number } | null>(null);
  const quotaRequestRef = useRef<Promise<CreationQuota> | null>(null);

  async function handleMenuOpen(open: boolean) {
    if (!open) return;
    const cached = quotaCacheRef.current;
    if (cached && Date.now() - cached.fetchedAt < 15_000) {
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

  const quotaPercent = quota?.limit
    ? Math.max(0, Math.min(100, (quota.remaining / quota.limit) * 100))
    : 0;

  return (
    <DropdownMenu onOpenChange={(open) => void handleMenuOpen(open)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Workspace settings"
          className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
        >
          <Settings className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={24} align="end" alignOffset={-8} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-1.5 px-2 py-2">
            <span className="block text-[12px] font-semibold text-od-ink">Platform quota</span>
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
                <span className="text-od-ink-faint">Usage will appear here.</span>
              )}
            </span>
            {quota && (
              <div
                role="progressbar"
                aria-label={`${quota.remaining} of ${quota.limit} platform creation requests left`}
                aria-valuemin={0}
                aria-valuemax={quota.limit}
                aria-valuenow={quota.remaining}
                className="h-1.5 overflow-hidden rounded-full bg-od-canvas"
              >
                <div
                  className={`h-full rounded-full ${creationQuotaColorClass(quota.remaining)}`}
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isSignedIn ? (
            <>
              <DropdownMenuItem asChild className="cursor-pointer text-od-ink">
                <Link href="/import/github">
                  <GithubLogoIcon size={16} weight="regular" />
                  Connect GitHub
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer text-od-ink">
                <Link href="/dashboard/settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onSelect={onSignOut}
                className="cursor-pointer text-od-ink"
              >
                <LogOut className="h-4 w-4" />
                {pending ? "Logging out..." : "Log out"}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem asChild className="cursor-pointer text-od-ink">
              <Link href="/login">
                <LogIn className="h-4 w-4" />
                Log in
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
