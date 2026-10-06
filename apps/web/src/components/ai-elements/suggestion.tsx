"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type SuggestionsProps = ComponentProps<"div">;

// Wraps instead of upstream's horizontal ScrollArea: the agent panel is narrow,
// and a sideways-scrolling row hides most of the options.
export const Suggestions = ({ className, ...props }: SuggestionsProps) => (
  <div className={cn("flex flex-wrap items-center gap-1.5", className)} {...props} />
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => (
  <Button
    className={cn("h-auto min-h-7 whitespace-normal rounded-full px-3 py-1 text-xs", className)}
    onClick={() => onClick?.(suggestion)}
    size={size}
    type="button"
    variant={variant}
    {...props}
  >
    {children || suggestion}
  </Button>
);
