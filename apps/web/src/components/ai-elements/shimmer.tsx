import { cn } from "@/lib/utils";
import { type CSSProperties, memo } from "react";

export type TextShimmerProps = {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
};

// A CSS animation (`.od-shimmer` in globals.css) instead of upstream's motion
// component: no ~30 kB `motion` import for a text effect, and the stylesheet
// stops it under `prefers-reduced-motion`.
const ShimmerComponent = ({ children, className, duration = 2, spread = 2 }: TextShimmerProps) => (
  <span
    className={cn("od-shimmer relative inline-block", className)}
    style={
      {
        "--spread": `${children.length * spread}px`,
        "--duration": `${duration}s`,
      } as CSSProperties
    }
  >
    {children}
  </span>
);

export const Shimmer = memo(ShimmerComponent);
