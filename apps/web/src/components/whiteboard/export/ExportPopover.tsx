"use client";

import { useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { IconBrandGithubFilled } from "@tabler/icons-react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { authClient, frontendCallbackURL } from "@/lib/auth-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportScene,
  exportSize,
  listFrames,
  selectedCount,
  type ExportFormat,
  type ExportOptions,
  type ExportScale,
  type ExportTarget,
} from "./export-scene";

// Set before a guest leaves to sign in, read when they land back on a canvas.
// sessionStorage, not a query param: draft promotion replaces the URL.
export const REOPEN_EXPORT_KEY = "od:reopen-export";

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "png", label: "PNG", hint: "Sharp image for docs and slides" },
  { value: "jpg", label: "JPG", hint: "Smaller file, no transparency" },
  { value: "svg", label: "SVG", hint: "Vector, crisp at any size" },
  { value: "excalidraw", label: "Excalidraw", hint: "Editable .excalidraw file" },
];

const SCALES: ExportScale[] = [1, 2, 3];

type ExportPopoverProps = {
  api: ExcalidrawImperativeAPI;
  fileName: string;
  isSignedIn: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Email sign-in, through the workspace's own redirect-back flow. */
  onSignIn: () => void;
};

/**
 * Canva-style download panel: file type, size, what to include, one button.
 * Guests get a sign-in card in the same spot instead of the options.
 */
export function ExportPopover({
  api,
  fileName,
  isSignedIn,
  open,
  onOpenChange,
  onSignIn,
}: ExportPopoverProps) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState<ExportScale>(2);
  const [transparent, setTransparent] = useState(false);
  const [target, setTarget] = useState<ExportTarget>({ kind: "canvas" });
  const [frames, setFrames] = useState<{ id: string; name: string }[]>([]);
  const [selection, setSelection] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // The scene changes while the panel is closed, so re-read it on every open.
  // A selection, when there is one, is the likeliest thing to want out.
  useEffect(() => {
    if (!open) return;
    const count = selectedCount(api);
    setFrames(listFrames(api));
    setSelection(count);
    setTarget({ kind: count ? "selection" : "canvas" });
  }, [api, open]);

  const options: ExportOptions = { format, target, scale, transparent };
  const fileCount = target.kind === "diagrams" ? target.ids.length : 1;
  const isRaster = format === "png" || format === "jpg";
  const canBeTransparent = format === "png" || format === "svg";

  useEffect(() => {
    if (!open || !isRaster) return setSize(null);
    let cancelled = false;
    // transparent left out: it never changes the size, and each run is a render.
    exportSize(api, { format, target, scale, transparent: false })
      .then((next) => !cancelled && setSize(next))
      .catch(() => !cancelled && setSize(null));
    return () => {
      cancelled = true;
    };
  }, [api, open, isRaster, format, target, scale]);

  async function handleDownload() {
    setBusy(true);
    try {
      await exportScene(api, options, fileName);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-[8px] border border-od-border-soft px-3 text-[12px] font-medium text-od-ink transition hover:bg-od-canvas/45"
        >
          <Download aria-hidden className="h-3.5 w-3.5" />
          Export
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 space-y-4 p-4">
        {!isSignedIn ? (
          <SignInCard onSignIn={onSignIn} />
        ) : (
          <>
            <p className="text-[14px] font-semibold text-od-ink">Download</p>

            <Field label="File type">
              <Select value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
                <SelectTrigger aria-label="File type" className="h-9 text-[13px]">
                  {/* Children override the trigger text, which would otherwise copy
                  the whole item, hint and badge included. */}
                  <SelectValue>{FORMATS.find((item) => item.value === format)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="py-2">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{item.label}</span>
                        {item.value === "png" && (
                          <span className="rounded bg-od-canvas px-1.5 py-0.5 text-[10px] text-od-ink-muted">
                            Suggested
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-od-ink-faint">{item.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <IncludePicker
              frames={frames}
              selection={selection}
              target={target}
              onChange={setTarget}
            />

            {isRaster && (
              <Field
                label="Size"
                aside={
                  size
                    ? `${size.width.toLocaleString()} × ${size.height.toLocaleString()} px`
                    : null
                }
              >
                <div className="grid grid-cols-3 gap-1 rounded-[8px] bg-od-canvas/50 p-1">
                  {SCALES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={scale === value}
                      onClick={() => setScale(value)}
                      className={`h-7 rounded-[6px] text-[12px] font-medium transition ${
                        scale === value
                          ? "bg-white text-od-ink shadow-sm"
                          : "text-od-ink-faint hover:text-od-ink"
                      }`}
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {canBeTransparent && (
              <label className="flex items-center gap-2 text-[13px] text-od-ink">
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(event) => setTransparent(event.target.checked)}
                  className="size-4 accent-od-ink"
                />
                Transparent background
              </label>
            )}

            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={busy}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-od-ink text-[13px] font-medium text-white transition hover:bg-od-ink/90 disabled:cursor-wait disabled:opacity-70"
            >
              {busy ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <Download aria-hidden className="h-4 w-4" />
              )}
              {fileCount > 1 ? `Download ${fileCount} files` : "Download"}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-od-ink-muted">{label}</span>
        {aside && <span className="text-[11px] text-od-ink-faint">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

function IncludePicker({
  frames,
  selection,
  target,
  onChange,
}: {
  frames: { id: string; name: string }[];
  selection: number;
  target: ExportTarget;
  onChange: (target: ExportTarget) => void;
}) {
  const picked = new Set(target.kind === "diagrams" ? target.ids : []);
  const setTarget = onChange;

  function toggleDiagram(id: string) {
    const ids = frames.map((frame) => frame.id).filter((x) => (x === id) !== picked.has(x));
    setTarget(ids.length ? { kind: "diagrams", ids } : { kind: "canvas" });
  }

  const label =
    target.kind === "canvas"
      ? "Whole canvas"
      : target.kind === "selection"
        ? `Selection (${selection})`
        : picked.size === 1
          ? (frames.find((frame) => picked.has(frame.id))?.name ?? "1 diagram")
          : `${picked.size} diagrams`;

  return (
    <Field label="Include" aside={picked.size > 1 ? `${picked.size} files, one .zip` : null}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label="Include"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-[13px] text-od-ink"
        >
          <span className="truncate">{label}</span>
          <ChevronDown aria-hidden className="h-4 w-4 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
        >
          <DropdownMenuCheckboxItem
            checked={target.kind === "canvas"}
            onCheckedChange={() => setTarget({ kind: "canvas" })}
          >
            Whole canvas
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={target.kind === "selection"}
            disabled={!selection}
            onCheckedChange={() => setTarget({ kind: "selection" })}
          >
            {selection ? `Selection (${selection})` : "Selection (select something first)"}
          </DropdownMenuCheckboxItem>
          {frames.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal text-od-ink-faint">
                Diagrams, one file each
              </DropdownMenuLabel>
              {frames.length > 1 && (
                <DropdownMenuCheckboxItem
                  checked={picked.size === frames.length}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    setTarget(
                      checked
                        ? { kind: "diagrams", ids: frames.map((frame) => frame.id) }
                        : { kind: "canvas" },
                    )
                  }
                >
                  All diagrams
                </DropdownMenuCheckboxItem>
              )}
              {frames.map((frame) => (
                <DropdownMenuCheckboxItem
                  key={frame.id}
                  checked={picked.has(frame.id)}
                  // Stay open: picking several is the point of this list.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => toggleDiagram(frame.id)}
                >
                  <span className="truncate">{frame.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}

function SignInCard({ onSignIn }: { onSignIn: () => void }) {
  function remember() {
    try {
      sessionStorage.setItem(REOPEN_EXPORT_KEY, "1");
    } catch {
      // Storage blocked: they land back without the panel open, nothing worse.
    }
  }
  const button =
    "flex h-10 w-full items-center justify-center gap-2 rounded-[8px] text-[13px] font-medium transition";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[14px] font-semibold text-od-ink">Download your diagram</p>
        <p className="text-[13px] leading-5 text-od-ink-muted">
          Sign in to export PNG, JPG, SVG and .excalidraw. It is free, and this diagram comes with
          you.
        </p>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            remember();
            const back = window.location.pathname + window.location.search;
            void authClient.signIn.social({
              provider: "github",
              callbackURL: frontendCallbackURL(back),
              errorCallbackURL: frontendCallbackURL(`/login?redirect=${encodeURIComponent(back)}`),
            });
          }}
          className={`${button} bg-od-ink text-white hover:bg-od-ink/90`}
        >
          <IconBrandGithubFilled size={16} />
          Continue with GitHub
        </button>
        <button
          type="button"
          onClick={() => {
            remember();
            onSignIn();
          }}
          className={`${button} border border-od-border-soft text-od-ink hover:bg-od-canvas/45`}
        >
          Sign in with email
        </button>
      </div>
    </div>
  );
}
