"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { memo, useState } from "react";
import { Streamdown } from "streamdown";
import { Shimmer } from "./shimmer";

export type ReasoningProps = {
  children: string;
  isStreaming?: boolean;
  className?: string;
};

/**
 * Collapsible model reasoning. Open while it streams, closed once it is done,
 * unless the user has toggled it. Upstream tracks a "Thought for N seconds"
 * duration through effects; a reloaded message has no duration to show, so
 * this keeps one label for both.
 */
export const Reasoning = memo(({ children, isStreaming = false, className }: ReasoningProps) => {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? isStreaming;

  return (
    <Collapsible className={cn("not-prose", className)} onOpenChange={setUserOpen} open={open}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground">
        <BrainIcon className="size-3.5" />
        {isStreaming ? <Shimmer duration={1}>Thinking…</Shimmer> : <span>Thought process</span>}
        <ChevronDownIcon
          className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 border-od-border-soft border-l-2 pl-3 text-muted-foreground text-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <Streamdown>{children}</Streamdown>
      </CollapsibleContent>
    </Collapsible>
  );
});

Reasoning.displayName = "Reasoning";
