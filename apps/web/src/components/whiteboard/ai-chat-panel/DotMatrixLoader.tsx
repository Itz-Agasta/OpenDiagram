import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type DotMatrixLoaderProps = {
  className?: string;
};

const DOTS = Array.from({ length: 25 }, (_, index) => index);

export function DotMatrixLoader({ className }: DotMatrixLoaderProps) {
  return (
    <span className={cn("dot-matrix-loader", className)} aria-hidden="true">
      <style>{`
        @keyframes dot-matrix-loader-pulse {
          0%, 100% { opacity: 0.18; transform: scale(0.72); }
          38% { opacity: 1; transform: scale(1); }
          68% { opacity: 0.36; transform: scale(0.86); }
        }

        .dot-matrix-loader {
          display: inline-grid;
          grid-template-columns: repeat(5, 3px);
          grid-template-rows: repeat(5, 3px);
          gap: 2px;
          width: 23px;
          height: 23px;
          flex: 0 0 auto;
        }

        .dot-matrix-loader > span {
          width: 3px;
          height: 3px;
          border-radius: 999px;
          background: currentColor;
          animation: dot-matrix-loader-pulse 1.15s ease-in-out infinite;
          animation-delay: calc((var(--dot-index) * -46ms) + (var(--dot-row) * 24ms));
        }

        @media (prefers-reduced-motion: reduce) {
          .dot-matrix-loader > span {
            animation: none;
            opacity: 0.68;
            transform: none;
          }
        }
      `}</style>
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
