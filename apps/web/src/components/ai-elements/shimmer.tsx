"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { type CSSProperties, memo } from "react";

export type TextShimmerProps = {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
};

// `motion.span` rather than upstream's `motion.create(as)`: that ran inside
// render, so every render made a new component type and remounted the text.
const ShimmerComponent = ({ children, className, duration = 2, spread = 2 }: TextShimmerProps) => (
  <motion.span
    animate={{ backgroundPosition: "0% center" }}
    className={cn(
      "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
      "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
      className,
    )}
    initial={{ backgroundPosition: "100% center" }}
    style={
      {
        "--spread": `${children.length * spread}px`,
        backgroundImage:
          "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
      } as CSSProperties
    }
    transition={{ repeat: Number.POSITIVE_INFINITY, duration, ease: "linear" }}
  >
    {children}
  </motion.span>
);

export const Shimmer = memo(ShimmerComponent);
