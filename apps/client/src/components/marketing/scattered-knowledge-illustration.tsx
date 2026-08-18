import { useEffect, useState } from "react";
import { ArticleIcon, ChatCircleIcon, GitBranchIcon, ImageIcon } from "@phosphor-icons/react";
import { m, useReducedMotion, LazyMotion, domAnimation } from "motion/react";
import { assetUrl } from "#/lib/utils/site";

/**
 * Narrative: OpenDiagram mascot gathers scattered knowledge into one workspace.
 * Entrance once; ambient then quiet. B&W + mascot.png + Phosphor icons.
 */

const ENTRANCE_MS = 2400;
const AMBIENT_FLOAT = 0.28;

const FRAGMENTS = [
  {
    id: "shots",
    label: "Screenshots",
    Icon: ImageIcon,
    className: "left-[5%] top-[10%]",
    delay: 0,
    duration: 5.6,
    floatY: -7,
  },
  {
    id: "repos",
    label: "Repositories",
    Icon: GitBranchIcon,
    className: "right-[5%] top-[12%]",
    delay: 0.15,
    duration: 6.0,
    floatY: -6,
  },
  {
    id: "docs",
    label: "Documents",
    Icon: ArticleIcon,
    className: "left-[6%] bottom-[12%]",
    delay: 0.3,
    duration: 5.8,
    floatY: 7,
  },
  {
    id: "chat",
    label: "Chat history",
    Icon: ChatCircleIcon,
    className: "right-[6%] bottom-[14%]",
    delay: 0.45,
    duration: 6.2,
    floatY: 8,
  },
] as const;

function FragmentChip({
  label,
  Icon,
  className,
  delay,
  duration,
  floatY,
  reduceMotion,
  ambient,
}: {
  label: string;
  Icon: (typeof FRAGMENTS)[number]["Icon"];
  className: string;
  delay: number;
  duration: number;
  floatY: number;
  reduceMotion: boolean | null;
  ambient: boolean;
}) {
  const quietY = floatY * AMBIENT_FLOAT;

  return (
    <m.div
      className={`absolute z-10 flex max-w-[130px] items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-2.5 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.06)] sm:max-w-none sm:px-3 sm:py-2.5 ${className}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
      animate={
        reduceMotion
          ? { opacity: 1, scale: 1, y: 0 }
          : ambient
            ? { opacity: 1, scale: 1, y: [0, quietY, 0] }
            : { opacity: 1, scale: 1, y: 0 }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : ambient
            ? { y: { duration: duration * 1.1, repeat: Infinity, ease: "easeInOut" } }
            : {
                opacity: { duration: 0.45, delay, ease: [0.2, 0, 0, 1] },
                scale: { duration: 0.45, delay, ease: [0.05, 0.7, 0.1, 1] },
              }
      }
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-black">
        <Icon weight="duotone" className="size-3.5 sm:size-4" aria-hidden="true" />
      </span>
      <span className="font-excali text-[13px] font-normal leading-tight text-black">{label}</span>
    </m.div>
  );
}

const CONNECTOR_PATHS = [
  "M 70 55 Q 160 90 250 155",
  "M 450 60 Q 360 95 270 155",
  "M 70 285 Q 160 230 250 185",
  "M 450 280 Q 360 230 270 185",
];

function ConnectorLines({ reduceMotion }: { reduceMotion: boolean | null }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
      viewBox="0 0 520 340"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {CONNECTOR_PATHS.map((d, i) => (
        <m.path
          key={d}
          d={d}
          stroke="rgba(0,0,0,0.16)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="5 6"
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  pathLength: {
                    duration: 0.9,
                    delay: 0.55 + i * 0.1,
                    ease: [0.2, 0, 0, 1],
                  },
                  opacity: { duration: 0.3, delay: 0.55 + i * 0.1 },
                }
          }
        />
      ))}
    </svg>
  );
}

function MascotWorker({
  reduceMotion,
  ambient,
}: {
  reduceMotion: boolean | null;
  ambient: boolean;
}) {
  return (
    <m.div
      className="absolute left-1/2 top-1/2 z-20 flex w-[min(48%,220px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center sm:w-[230px]"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 12 }}
      animate={
        reduceMotion
          ? { opacity: 1, scale: 1, y: 0 }
          : ambient
            ? { opacity: 1, scale: 1, y: [0, -3, 0] }
            : { opacity: 1, scale: 1, y: 0 }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : ambient
            ? { y: { duration: 4.8, repeat: Infinity, ease: "easeInOut" } }
            : { duration: 0.6, delay: 0.5, ease: [0.05, 0.7, 0.1, 1] }
      }
    >
      <m.div
        className="mb-2 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 shadow-[0_4px_14px_rgba(0,0,0,0.06)]"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.35, delay: 0.9 }}
      >
        <div className="flex items-center gap-1.5">
          <m.span
            className="size-1.5 rounded-full bg-black"
            animate={
              reduceMotion ? undefined : ambient ? { opacity: [0.4, 0.9, 0.4] } : { opacity: 1 }
            }
            transition={
              reduceMotion
                ? undefined
                : ambient
                  ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.2 }
            }
          />
          <span className="font-excali text-[11px] text-black/55">Connecting fragments…</span>
        </div>
      </m.div>

      <m.div
        className="relative flex size-[90px] items-center justify-center rounded-[20px] border border-black/[0.08] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.1)] xs:size-[110px] sm:size-[120px] sm:rounded-[28px] md:size-[140px]"
        animate={
          reduceMotion
            ? undefined
            : ambient
              ? {
                  boxShadow: [
                    "0 16px 48px rgba(0,0,0,0.08)",
                    "0 18px 52px rgba(0,0,0,0.11)",
                    "0 16px 48px rgba(0,0,0,0.08)",
                  ],
                }
              : undefined
        }
        transition={
          reduceMotion
            ? undefined
            : ambient
              ? { duration: 5, repeat: Infinity, ease: "easeInOut" }
              : undefined
        }
      >
        <img
          src={assetUrl("/brand/mascot.png")}
          alt=""
          width={120}
          height={120}
          className="relative z-10 size-[68px] object-contain xs:size-[80px] sm:size-[90px] sm:size-[104px]"
          loading="lazy"
        />

        {/* Tools in use — held by the mascot, kept inside the card bounds */}
        <m.span
          className="absolute left-1.5 top-2 flex size-5 items-center justify-center rounded-md border border-black/[0.08] bg-white text-black shadow-sm sm:left-2 sm:top-3 sm:size-7"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.35, delay: 1.05, ease: [0.05, 0.7, 0.1, 1] }
          }
        >
          <ImageIcon weight="duotone" className="size-2.5 sm:size-3.5" aria-hidden="true" />
        </m.span>
        <m.span
          className="absolute right-1.5 top-2 flex size-5 items-center justify-center rounded-md border border-black/[0.08] bg-white text-black shadow-sm sm:right-2 sm:top-3 sm:size-7"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.35, delay: 1.15, ease: [0.05, 0.7, 0.1, 1] }
          }
        >
          <GitBranchIcon weight="duotone" className="size-3.5" aria-hidden="true" />
        </m.span>
        <m.span
          className="absolute bottom-2 left-1.5 flex size-5 items-center justify-center rounded-md border border-black/[0.08] bg-white text-black shadow-sm sm:bottom-3 sm:left-2 sm:size-7"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.35, delay: 1.25, ease: [0.05, 0.7, 0.1, 1] }
          }
        >
          <ArticleIcon weight="duotone" className="size-3.5" aria-hidden="true" />
        </m.span>
        <m.span
          className="absolute bottom-2 right-1.5 flex size-5 items-center justify-center rounded-md border border-black/[0.08] bg-white text-black shadow-sm sm:bottom-3 sm:right-2 sm:size-7"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.35, delay: 1.3, ease: [0.05, 0.7, 0.1, 1] }
          }
        >
          <ChatCircleIcon weight="duotone" className="size-3.5" aria-hidden="true" />
        </m.span>
      </m.div>

      <p className="mt-2 text-center font-excali text-[11px] font-normal text-black sm:mt-3 sm:text-[14px]">
        Mascot unifies the pieces
      </p>
      <p className="mt-0.5 text-center font-excali text-[9px] text-black/45 sm:text-[12px]">
        One canvas · one story
      </p>
    </m.div>
  );
}

export function ScatteredKnowledgeIllustration() {
  const reduceMotion = useReducedMotion();
  const [ambient, setAmbient] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setAmbient(true), ENTRANCE_MS);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] bg-[#f7f7f5]"
        role="img"
        aria-label="OpenDiagram mascot connecting screenshots, repositories, documents, and chat into one architecture workspace"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:36px_36px]"
        />
        <m.div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[44%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/[0.035] blur-3xl"
          animate={
            reduceMotion
              ? undefined
              : ambient
                ? { opacity: [0.28, 0.4, 0.28], scale: [0.98, 1.02, 0.98] }
                : { opacity: 0.4, scale: 1 }
          }
          transition={
            reduceMotion
              ? undefined
              : ambient
                ? { duration: 6.5, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.5, delay: 0.8 }
          }
        />

        <ConnectorLines reduceMotion={reduceMotion} />

        {FRAGMENTS.map((f) => (
          <FragmentChip
            key={f.id}
            label={f.label}
            Icon={f.Icon}
            className={f.className}
            delay={f.delay}
            duration={f.duration}
            floatY={f.floatY}
            reduceMotion={reduceMotion}
            ambient={ambient}
          />
        ))}

        <MascotWorker reduceMotion={reduceMotion} ambient={ambient} />
      </div>
    </LazyMotion>
  );
}
