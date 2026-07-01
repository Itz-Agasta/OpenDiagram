"use client";

import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface SkillChipProps {
  label: string;
  icon: string;
  iconBackground: string;
  iconColor: string;
  rotation: number;
  className?: string;
}

function SkillIcon({ icon, color }: { icon: string; color: string }) {
  if (icon === "SidebarSimple") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="2" stroke={color} strokeWidth="1.5" />
        <path d="M6 3v10" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }

  if (icon === "FileDashed") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 2.75h5l3 3v7.5H4z" stroke={color} strokeWidth="1.5" strokeDasharray="2 1.5" />
        <path d="M9 2.75v3h3" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }

  if (icon === "Path") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="4" cy="4" r="1.75" stroke={color} strokeWidth="1.5" />
        <circle cx="12" cy="12" r="1.75" stroke={color} strokeWidth="1.5" />
        <path
          d="M5.5 4h2.75a3.75 3.75 0 0 1 0 7.5H10.5"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "MagnifyingGlass") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4" stroke={color} strokeWidth="1.5" />
        <path d="m10 10 3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "GridFour") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.5 9.55 6l3.7.4-2.8 2.45.8 3.65L8 10.6l-3.25 1.9.8-3.65L2.75 6.4 6.45 6z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkillChip({
  label,
  icon,
  iconBackground,
  iconColor,
  rotation,
  className = "",
}: SkillChipProps) {
  return (
    <div
      data-rotation={rotation}
      className={`hello-badge absolute rounded-[30px] border-[10px] border-white/50 ${className}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-black shadow-sm backdrop-blur-sm">
        <span>{label}</span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBackground }}
        >
          <SkillIcon icon={icon} color={iconColor} />
        </span>
      </div>
    </div>
  );
}

function TextOpacityWords({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.75", "start 0.35"],
  });

  const words = text.split(" ");

  return (
    <p
      ref={ref}
      className="text-center text-5xl font-bold leading-[1.4] -tracking-[0.04em] max-md:text-3xl"
    >
      {words.map((word, i) => (
        <WordFade
          key={`${word}-${i}`}
          word={word}
          index={i}
          total={words.length}
          progress={scrollYProgress}
        />
      ))}
    </p>
  );
}

function WordFade({
  word,
  index,
  total,
  progress,
}: {
  word: string;
  index: number;
  total: number;
  progress: import("framer-motion").MotionValue<number>;
}) {
  const start = index / total;
  const end = (index + 1) / total;
  const opacity = useTransform(progress, [start, end], [0.2, 1]);

  return <motion.span style={{ opacity }}>{word} </motion.span>;
}

export function IntroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const badges = gsap.utils.toArray<HTMLElement>(".hello-badge");

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        badges.forEach((badge) => {
          gsap.set(badge, {
            autoAlpha: 1,
            rotation: Number(badge.dataset.rotation ?? 0),
            x: 0,
            y: 0,
          });
        });
        return;
      }

      const directions = [
        { x: -560, y: -180, swing: -34 },
        { x: 520, y: -220, swing: 38 },
        { x: 600, y: 160, swing: 30 },
        { x: -520, y: 180, swing: -32 },
        { x: -340, y: 360, swing: 26 },
        { x: 360, y: -360, swing: -28 },
      ];

      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 68%",
          once: true,
        },
      });

      badges.forEach((badge, index) => {
        const direction = directions[index % directions.length];
        const finalRotation = Number(badge.dataset.rotation ?? 0);

        gsap.set(badge, {
          autoAlpha: 0,
          x: direction.x,
          y: direction.y,
          rotation: finalRotation + direction.swing,
          transformOrigin: "50% -90px",
        });

        timeline.to(
          badge,
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            rotation: finalRotation,
            duration: 1.05,
          },
          0.15 + index * 0.055,
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="flex w-full flex-col items-center justify-center overflow-hidden px-[120px] max-md:px-6"
    >
      <div className="relative flex min-h-screen w-full max-w-[1366px] flex-col items-center justify-center py-20">
        <div className="relative z-10 inline-flex items-center gap-6 rounded-full px-6">
          <span className="h-px w-[69px] bg-black/50" />
          <span className="font-serif text-2xl italic">Hello!</span>
          <span className="h-px w-[69px] bg-black/50" />
        </div>

        <div className="relative flex w-full max-w-[940px] flex-col items-center gap-12 px-[120px] py-12 max-md:px-6">
          <TextOpacityWords text="We help open source projects turn complex codebases into clear, beautiful documentation that contributors actually read" />

          <SkillChip
            label="Architecture Diagrams"
            icon="Strategy"
            iconBackground="rgb(255, 213, 0)"
            iconColor="rgb(102, 0, 128)"
            rotation={4}
            className="right-[-78px] bottom-[52px] max-md:hidden"
          />
          <SkillChip
            label="API Docs"
            icon="SidebarSimple"
            iconBackground="rgb(71, 71, 71)"
            iconColor="rgb(186, 255, 208)"
            rotation={4}
            className="left-[-57px] top-1/2 -translate-y-1/2 max-md:hidden"
          />
          <SkillChip
            label="README"
            icon="FileDashed"
            iconBackground="rgb(255, 69, 171)"
            iconColor="rgb(201, 255, 251)"
            rotation={-4}
            className="right-[-98px] top-1/2 -translate-y-1/2 max-md:hidden"
          />
          <SkillChip
            label="Data Flow"
            icon="Path"
            iconBackground="rgb(82, 255, 105)"
            iconColor="rgb(50, 36, 255)"
            rotation={-5}
            className="right-[-92px] top-[51px] max-md:hidden"
          />
          <SkillChip
            label="Changelogs"
            icon="MagnifyingGlass"
            iconBackground="rgb(5, 169, 255)"
            iconColor="rgb(248, 255, 191)"
            rotation={-4}
            className="bottom-[51px] left-[-75px] max-md:hidden"
          />
          <SkillChip
            label="Component Maps"
            icon="GridFour"
            iconBackground="rgb(255, 94, 0)"
            iconColor="rgb(255, 243, 194)"
            rotation={3}
            className="left-[-120px] top-[62px] max-md:hidden"
          />
        </div>
      </div>
    </section>
  );
}
