"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SkillChip, TextOpacityWords } from "./intro-content";

gsap.registerPlugin(ScrollTrigger);

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
          <span className="font-serif text-2xl italic">What is a Vibe Diagram?</span>
          <span className="h-px w-[69px] bg-black/50" />
        </div>

        <div className="relative flex w-full max-w-[940px] flex-col items-center gap-12 px-[120px] py-12 max-md:px-6">
          <TextOpacityWords text="Vibe diagramming is a faster way to design software systems. Describe how the system should work, get a visual first draft, then refine the architecture through conversation and a real editing canvas." />

          <SkillChip
            label="System Architecture"
            icon="Strategy"
            iconBackground="rgb(255, 213, 0)"
            iconColor="rgb(102, 0, 128)"
            rotation={4}
            className="right-[-78px] bottom-[52px] max-md:hidden"
          />
          <SkillChip
            label="Design Decisions"
            icon="SidebarSimple"
            iconBackground="rgb(71, 71, 71)"
            iconColor="rgb(186, 255, 208)"
            rotation={4}
            className="left-[-57px] top-1/2 -translate-y-1/2 max-md:hidden"
          />
          <SkillChip
            label="Living Context"
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
            label="AI Collaboration"
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
