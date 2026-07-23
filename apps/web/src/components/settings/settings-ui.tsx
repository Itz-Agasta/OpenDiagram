import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const fieldClassName =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-od-body text-od-ink outline-none placeholder:text-od-ink-faint focus:border-od-ink";

const selectClassName =
  "h-10 w-full cursor-pointer appearance-none rounded-md border border-black/15 bg-transparent py-0 pl-3 pr-10 text-od-body text-od-ink outline-none focus:border-od-ink";

export function ProfileSkeleton() {
  return (
    <main className="product-ui min-h-dvh bg-od-surface px-4 py-8 text-od-ink md:px-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-40" />
        <div className="space-y-4 border-t border-black/10 pt-6">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
    </main>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-od-heading uppercase tracking-[0.08em] text-od-ink-faint">{children}</h2>
  );
}

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-black/10 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:max-w-[45%]">
        <p className="text-od-heading text-od-ink">{label}</p>
        {description && <p className="mt-0.5 text-od-body text-od-ink-faint">{description}</p>}
      </div>
      <div className="min-w-0 shrink-0 text-od-body text-od-ink sm:text-right">{children}</div>
    </div>
  );
}

export function SelectField({ className, children, ...props }: ComponentProps<"select">) {
  const compact = Boolean(className?.includes("sm:w-auto"));
  return (
    <div className={compact ? "relative inline-block w-full sm:w-auto" : "relative w-full"}>
      <select {...props} className={`${selectClassName} ${className ?? ""}`}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-od-ink"
        strokeWidth={2}
      />
    </div>
  );
}
