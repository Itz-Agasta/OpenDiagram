import type { ReactNode } from "react";
import { m, useInView, useReducedMotion, LazyMotion, domAnimation } from "motion/react";
import { useRef } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  amount?: number;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  duration = 0.65,
  amount = 0.2,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount });
  const shouldReduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        ref={ref}
        initial={false}
        animate={shouldReduceMotion || isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
        transition={
          shouldReduceMotion ? { duration: 0 } : { duration, delay, ease: [0.16, 1, 0.3, 1] }
        }
        className={className}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
