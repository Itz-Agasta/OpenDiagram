import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type DotMatrixLoaderProps = {
  className?: string;
};

const DOTS = Array.from({ length: 25 }, (_, index) => index);

export function DotMatrixLoader({ className }: DotMatrixLoaderProps) {
  return (
    <span className={cn("dot-matrix-loader", className)} aria-hidden="true">
      {DOTS.map((index) => (
        <span
          key={index}
          style={
            {
              "--dot-index": index,
              "--dot-row": Math.floor(index / 5),
            } as CSSProperties
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
