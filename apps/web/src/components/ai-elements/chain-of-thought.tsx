"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, DotIcon, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { memo } from "react";

export type ChainOfThoughtProps = ComponentProps<typeof Collapsible>;

export const ChainOfThought = memo(({ className, ...props }: ChainOfThoughtProps) => (
  <Collapsible className={cn("not-prose space-y-2", className)} {...props} />
));

export type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  icon?: LucideIcon;
};

export const ChainOfThoughtHeader = memo(
  ({ className, children, icon: Icon, ...props }: ChainOfThoughtHeaderProps) => (
    <CollapsibleTrigger
      className={cn(
        "group/cot flex w-full items-center gap-1.5 text-left text-muted-foreground text-xs transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]/cot:rotate-180" />
    </CollapsibleTrigger>
  ),
);

export type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>;

export const ChainOfThoughtContent = memo(({ className, ...props }: ChainOfThoughtContentProps) => (
  <CollapsibleContent
    className={cn(
      "space-y-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending";
};

const statusStyles = {
  complete: "text-muted-foreground",
  active: "text-foreground",
  pending: "text-muted-foreground/50",
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = DotIcon,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => (
    <div
      className={cn(
        "flex gap-2 text-xs",
        statusStyles[status],
        "motion-safe:animate-in motion-safe:fade-in-0",
        className,
      )}
      {...props}
    >
      <Icon className="mt-px size-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div>{label}</div>
        {description && <div className="text-muted-foreground">{description}</div>}
        {children}
      </div>
    </div>
  ),
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
