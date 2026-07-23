import Link from "next/link";
import { LogIn, LogOut, Search, Settings } from "lucide-react";
import { GithubLogoIcon } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      <div className="flex h-16 items-center gap-3 border-b border-od-border-soft px-4">
        {props.isSignedIn &&
          (props.accountImage ? (
            <img
              src={props.accountImage}
              alt=""
              className="h-9 w-9 rounded-[8px] border border-od-border-soft object-cover"
            />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-od-ink text-[13px] font-semibold text-od-on-dark">
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Workspace settings"
          className="grid h-8 w-8 place-items-center rounded-[8px] text-od-ink-faint transition hover:bg-od-canvas/60 hover:text-od-ink"
        >
          <Settings className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" sideOffset={24} align="end" className="w-40">
        <DropdownMenuGroup>
          {isSignedIn ? (
            <>
              <DropdownMenuItem asChild className="cursor-pointer text-od-ink">
                <Link href="/import/github">
                  <GithubLogoIcon size={16} weight="regular" />
                  Connect GitHub
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer text-od-ink">
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  AI settings
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
