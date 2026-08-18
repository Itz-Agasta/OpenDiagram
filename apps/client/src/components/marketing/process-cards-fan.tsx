import { m, LazyMotion, domAnimation } from "motion/react";
import { ScrollReveal } from "#/components/landing/scroll-reveal";

export type ProcessCardsFanItem = {
  number: string;
  title: string;
  description: string;
  rotation: number;
};

function ProcessCard({ number, title, description, rotation }: ProcessCardsFanItem) {
  return (
    <div
      className="od-mobile-static-card w-full rounded-[30px] border-[10px] border-white/50 max-md:rounded-[22px] max-md:border-[6px]"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div className="flex w-full flex-col gap-6 rounded-[20px] bg-white/80 p-8 shadow-sm backdrop-blur-sm max-md:rounded-2xl max-md:p-6">
        <span className="text-[72px] font-thin leading-[1.25] -tracking-[0.06em] max-md:text-[56px]">
          {number}
        </span>
        <h3 className="text-2xl font-bold leading-[1.6] -tracking-[0.02em]">{title}</h3>
        <p className="text-base leading-[1.7] text-black/70">{description}</p>
      </div>
    </div>
  );
}

const connectorMotion = {
  fade: { duration: 0.45, delay: 0.4 },
  draw: { duration: 0.9, delay: 0.55, ease: "easeInOut" as const },
};

/** Landing layout: side cards lower, middle high — arcs rise into the center card. */
function DefaultConnectors() {
  return (
    <>
      <m.svg
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={connectorMotion.fade}
        className="pointer-events-none absolute left-[28%] top-[22%] z-30 hidden h-[72px] w-[120px] lg:block"
        viewBox="0 0 160 100"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="10" cy="78" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <circle cx="150" cy="14" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <m.path
          d="M15 74C32 40 78 8 145 16"
          stroke="#ff4a2c"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={connectorMotion.draw}
        />
      </m.svg>
      <m.svg
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ ...connectorMotion.fade, delay: 0.5 }}
        className="pointer-events-none absolute left-[62%] top-[38%] z-30 hidden h-[78px] w-[100px] lg:block"
        viewBox="0 0 140 110"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="10" cy="14" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <circle cx="128" cy="48" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <m.path
          d="M12 20C10 52 42 56 62 48C82 40 68 28 48 48C28 68 52 88 82 78C104 70 118 58 124 52"
          stroke="#ff4a2c"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ ...connectorMotion.draw, delay: 0.65, duration: 1.1 }}
        />
      </m.svg>
    </>
  );
}

/**
 * Middle-down layout: side cards high, center low —
 * first arc drops from card 1 into card 2; second rises from card 2 into card 3.
 */
function MiddleDownConnectors() {
  return (
    <>
      <m.svg
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={connectorMotion.fade}
        className="pointer-events-none absolute left-[30%] top-[18%] z-30 hidden h-[88px] w-[108px] lg:block"
        viewBox="0 0 150 120"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="18" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <circle cx="138" cy="102" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <m.path
          d="M16 22C42 28 88 48 134 98"
          stroke="#ff4a2c"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={connectorMotion.draw}
        />
      </m.svg>
      <m.svg
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ ...connectorMotion.fade, delay: 0.5 }}
        className="pointer-events-none absolute left-[60%] top-[34%] z-30 hidden h-[92px] w-[112px] lg:block"
        viewBox="0 0 150 130"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="14" cy="108" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <circle cx="136" cy="22" r="5" stroke="#ff4a2c" strokeWidth="2.5" />
        <m.path
          d="M18 104C36 88 48 42 72 36C98 28 112 52 124 44C132 38 134 28 136 24"
          stroke="#ff4a2c"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ ...connectorMotion.draw, delay: 0.65, duration: 1 }}
        />
      </m.svg>
    </>
  );
}

type ProcessCardsFanVariant = "default" | "middle-down";

/** Overlapping tilted process cards with orange connector paths (landing process layout). */
export function ProcessCardsFan({
  cards,
  variant = "default",
}: {
  cards: readonly [ProcessCardsFanItem, ProcessCardsFanItem, ProcessCardsFanItem];
  /** `middle-down`: side cards sit high; center card drops lower underneath. */
  variant?: ProcessCardsFanVariant;
}) {
  const [first, second, third] = cards;
  const middleDown = variant === "middle-down";

  return (
    <LazyMotion features={domAnimation}>
      <div className="relative flex w-full items-start justify-center max-lg:flex-col max-lg:items-center">
        {middleDown ? <MiddleDownConnectors /> : <DefaultConnectors />}

        <ScrollReveal
          delay={0.08}
          className={
            middleDown
              ? "relative z-20 -mr-4 flex w-[36%] flex-col gap-2.5 max-lg:-mr-0 max-lg:mb-[-24px] max-lg:w-full max-lg:max-w-[640px]"
              : "relative z-10 -mr-4 flex w-[36%] flex-col gap-2.5 pt-[62px] max-lg:-mr-0 max-lg:mb-[-24px] max-lg:w-full max-lg:max-w-[640px] max-lg:pt-0"
          }
        >
          <ProcessCard {...first} />
        </ScrollReveal>
        <ScrollReveal
          delay={0.16}
          className={
            middleDown
              ? "relative z-10 -mx-4 flex w-[36%] flex-col gap-2.5 pt-[88px] max-lg:-mx-0 max-lg:mb-[-24px] max-lg:w-full max-lg:max-w-[640px] max-lg:pt-0"
              : "relative z-20 -mx-4 flex w-[36%] flex-col gap-2.5 max-lg:-mx-0 max-lg:mb-[-24px] max-lg:w-full max-lg:max-w-[640px] max-lg:pt-0"
          }
        >
          <ProcessCard {...second} />
        </ScrollReveal>
        <ScrollReveal
          delay={0.24}
          className={
            middleDown
              ? "relative z-20 -ml-4 flex w-[36%] flex-col gap-2.5 pt-3 max-lg:-ml-0 max-lg:w-full max-lg:max-w-[640px] max-lg:pt-0"
              : "relative z-10 -ml-4 flex w-[36%] flex-col gap-2.5 pt-16 max-lg:-ml-0 max-lg:w-full max-lg:max-w-[640px] max-lg:pt-0"
          }
        >
          <ProcessCard {...third} />
        </ScrollReveal>
      </div>
    </LazyMotion>
  );
}
