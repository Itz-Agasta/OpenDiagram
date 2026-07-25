import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RecommendedBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-[0.04em] text-emerald-700 shadow-none hover:bg-emerald-500/10 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
        className,
      )}
    >
      <Sparkles className="size-2.5 shrink-0" aria-hidden="true" />
      Recommended
    </Badge>
  );
}
