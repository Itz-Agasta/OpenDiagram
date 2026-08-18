import { useEffect, useState } from "react";
import {
  CodeIcon,
  FolderSimpleIcon,
  GithubLogoIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { assetUrl } from "#/lib/utils/site";

/**
 * Narrative: OpenDiagram mascot maps a GitHub repo into architecture for you.
 * Entrance once; ambient then quiet (~28% float).
 */

const ENTRANCE_MS = 2400;
const AMBIENT_FLOAT = 0.28;

function GithubInput({
  reduceMotion,
  ambient,
}: {
  reduceMotion: boolean | null;
  ambient: boolean;
}) {
  return (
    <motion.div
      className="absolute left-[4%] top-1/2 z-10 w-[148px] -translate-y-1/2 sm:left-[6%] sm:w-[168px]"
      initial={reduceMotion ? false : { opacity: 0, x: -18 }}
      animate={
        reduceMotion
          ? { opacity: 1, x: 0, y: 0 }
          : ambient
            ? { opacity: 1, x: 0, y: [0, -4 * AMBIENT_FLOAT * 3, 0] }
            : { opacity: 1, x: 0, y: 0 }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : ambient
            ? { y: { duration: 5.8, repeat: Infinity, ease: "easeInOut" } }
            : { duration: 0.55, ease: [0.2, 0, 0, 1] }
      }
    >
      <div className="rounded-[14px] border border-black/[0.08] bg-white p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.07)] sm:p-4">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-black text-white">
            <GithubLogoIcon weight="fill" className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-excali text-[11px] text-black/45">Source</p>
            <p className="font-excali text-[14px] font-normal text-black">GitHub repo</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            { Icon: FolderSimpleIcon, label: "src / services" },
            { Icon: CodeIcon, label: "package.json" },
            { Icon: FolderSimpleIcon, label: "infra / …" },
          ].map(({ Icon, label }, i) => (
            <motion.div
              key={label}
              className="flex items-center gap-2 rounded-lg bg-black/[0.04] px-2 py-1.5"
              initial={reduceMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.35, delay: 0.35 + i * 0.1, ease: [0.2, 0, 0, 1] }
              }
            >
              <Icon
                weight="duotone"
                className="size-3.5 shrink-0 text-black/70"
                aria-hidden="true"
              />
              <span className="truncate font-excali text-[12px] text-black/55">{label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function FlowArrow({
  reduceMotion,
  fromLeft,
}: {
  reduceMotion: boolean | null;
  fromLeft: boolean;
}) {
  return (
    <motion.div
      className={`pointer-events-none absolute top-1/2 z-[6] hidden h-px -translate-y-1/2 bg-black/20 md:block ${
        fromLeft ? "left-[32%] w-[9%]" : "left-[62%] w-[8%]"
      }`}
      initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              duration: 0.45,
              delay: fromLeft ? 0.7 : 1.15,
              ease: [0.2, 0, 0, 1],
            }
      }
      style={{ transformOrigin: "left center" }}
    >
      <motion.span
        className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-black/45"
        animate={reduceMotion ? undefined : { opacity: [0.35, 0.8, 0.35], scale: [1, 1.15, 1] }}
        transition={
          reduceMotion
            ? undefined
            : {
                duration: 2.8,
                delay: fromLeft ? 1.1 : 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
      />
    </motion.div>
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
    <motion.div
      className="absolute left-1/2 top-1/2 z-20 flex w-[min(42%,200px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center sm:w-[210px]"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 14 }}
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
            : { duration: 0.6, delay: 0.55, ease: [0.05, 0.7, 0.1, 1] }
      }
    >
      {/* Working badge */}
      <motion.div
        className="mb-2 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 shadow-[0_4px_14px_rgba(0,0,0,0.06)]"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.35, delay: 0.95 }}
      >
        <div className="flex items-center gap-1.5">
          <motion.span
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
          <span className="font-excali text-[11px] text-black/55">Mapping system…</span>
        </div>
      </motion.div>

      {/* Mascot as the worker */}
      <motion.div
        className="relative flex size-[120px] items-center justify-center rounded-[28px] border border-black/[0.08] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.1)] sm:size-[136px]"
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
        {/* Soft work-ring behind mascot */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-3 rounded-[22px] border border-dashed border-black/10"
          animate={
            reduceMotion ? undefined : ambient ? { rotate: [0, 6, 0, -6, 0] } : { rotate: 0 }
          }
          transition={
            reduceMotion
              ? undefined
              : ambient
                ? { duration: 10, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.4 }
          }
        />
        <img
          src={assetUrl("/brand/mascot.png")}
          alt=""
          width={120}
          height={120}
          className="relative z-10 size-[88px] object-contain sm:size-[100px]"
          loading="lazy"
        />

        {/* Tiny “tool” chips the mascot is using */}
        <motion.span
          className="absolute -left-2 top-4 flex size-7 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-black shadow-sm"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.35, delay: 1.05, ease: [0.05, 0.7, 0.1, 1] }
          }
        >
          <GithubLogoIcon weight="fill" className="size-3.5" aria-hidden="true" />
        </motion.span>
        <motion.span
          className="absolute -right-2 bottom-5 flex size-7 items-center justify-center rounded-lg border border-black/[0.08] bg-black text-white shadow-sm"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
          animate={
            reduceMotion
              ? { opacity: 1, scale: 1 }
              : ambient
                ? { opacity: 1, scale: [1, 1.06, 1] }
                : { opacity: 1, scale: 1 }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : ambient
                ? { duration: 2.4, delay: 1.2, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.35, delay: 1.2, ease: [0.05, 0.7, 0.1, 1] }
          }
        >
          <TreeStructureIcon weight="bold" className="size-3.5" aria-hidden="true" />
        </motion.span>
      </motion.div>

      <p className="mt-2.5 text-center font-excali text-[14px] font-normal text-black">
        Your mascot does the mapping
      </p>
      <p className="mt-0.5 text-center font-excali text-[12px] text-black/45">
        You review · they assemble
      </p>
    </motion.div>
  );
}

function ArchitectureOutput({
  reduceMotion,
  ambient,
}: {
  reduceMotion: boolean | null;
  ambient: boolean;
}) {
  const nodes = [
    { label: "API", x: "12%", y: "22%" },
    { label: "Auth", x: "58%", y: "18%" },
    { label: "DB", x: "36%", y: "58%" },
    { label: "Queue", x: "68%", y: "62%" },
  ];

  return (
    <motion.div
      className="absolute right-[4%] top-1/2 z-10 w-[148px] -translate-y-1/2 sm:right-[5%] sm:w-[170px]"
      initial={reduceMotion ? false : { opacity: 0, x: 18 }}
      animate={
        reduceMotion
          ? { opacity: 1, x: 0, y: 0 }
          : ambient
            ? { opacity: 1, x: 0, y: [0, 4 * AMBIENT_FLOAT * 3, 0] }
            : { opacity: 1, x: 0, y: 0 }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : ambient
            ? { y: { duration: 6.2, repeat: Infinity, ease: "easeInOut" } }
            : { duration: 0.55, delay: 0.85, ease: [0.2, 0, 0, 1] }
      }
    >
      <div className="rounded-[14px] border border-black/[0.08] bg-white p-3 shadow-[0_12px_36px_rgba(0,0,0,0.07)] sm:p-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-black text-white">
            <TreeStructureIcon weight="bold" className="size-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-excali text-[11px] text-black/45">Output</p>
            <p className="font-excali text-[13px] font-normal text-black">Live diagram</p>
          </div>
        </div>

        <div className="relative h-[100px] overflow-hidden rounded-[10px] bg-[#f4f4f2] ring-1 ring-black/[0.06]">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:12px_12px]"
          />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden="true"
          >
            <motion.path
              d="M30 30 L55 28 L45 65 L70 68"
              stroke="rgba(0,0,0,0.18)"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.8, delay: 1.35, ease: [0.2, 0, 0, 1] }
              }
            />
          </svg>
          {nodes.map((node, i) => (
            <motion.div
              key={node.label}
              className="absolute rounded-md border border-black/15 bg-white px-1.5 py-0.5 font-excali text-[10px] font-normal text-black shadow-sm"
              style={{ left: node.x, top: node.y }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 0.35,
                      delay: 1.45 + i * 0.1,
                      ease: [0.05, 0.7, 0.1, 1],
                    }
              }
            >
              {node.label}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function GithubToWorkspaceIllustration() {
  const reduceMotion = useReducedMotion();
  const [ambient, setAmbient] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setAmbient(true), ENTRANCE_MS);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] bg-[#f7f7f5]"
      role="img"
      aria-label="OpenDiagram mascot mapping a GitHub repository into an editable architecture diagram"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:36px_36px]"
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[42%] w-[36%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/[0.035] blur-3xl"
        animate={
          reduceMotion
            ? undefined
            : ambient
              ? { opacity: [0.3, 0.42, 0.3], scale: [0.98, 1.02, 0.98] }
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

      <GithubInput reduceMotion={reduceMotion} ambient={ambient} />
      <FlowArrow reduceMotion={reduceMotion} fromLeft />
      <MascotWorker reduceMotion={reduceMotion} ambient={ambient} />
      <FlowArrow reduceMotion={reduceMotion} fromLeft={false} />
      <ArchitectureOutput reduceMotion={reduceMotion} ambient={ambient} />
    </div>
  );
}
