"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { ButtonShaderTexture } from "@/components/button-shader-texture";

const slideshowImages = [
  "https://framerusercontent.com/images/jSslhcqo8HKNjUvPEceq7bhbY.jpg",
  "https://framerusercontent.com/images/wWjLitV3mnO3fgL2J1WnS6WKDU.jpg",
  "https://framerusercontent.com/images/0Y1cjcOdQp68PBw6G3HHfHz6TYo.jpg",
];

const projectNames = ["Cal.com", "Dub", "Hono", "Supabase", "Storybook"];

function Slideshow({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) return;

    const timer = setInterval(() => setIndex((i) => (i + 1) % slideshowImages.length), 3000);
    return () => clearInterval(timer);
  }, [shouldReduceMotion]);

  return (
    <div
      className={`relative inline-flex h-[108px] w-[144px] -rotate-2 overflow-hidden rounded-[36px] border-2 border-black bg-black max-md:h-20 max-md:w-28 ${className}`}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={slideshowImages[index]}
          src={slideshowImages[index]}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -20 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.7, ease: "easeInOut" }}
        />
      </AnimatePresence>
    </div>
  );
}

function ProjectNames({ className = "" }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className={`relative inline-flex h-[108px] w-[220px] rotate-2 items-center overflow-hidden rounded-[36px] border-2 border-black bg-[#262626] max-md:h-20 max-md:w-40 ${className}`}
    >
      <motion.div
        className="absolute flex items-center whitespace-nowrap"
        animate={shouldReduceMotion ? undefined : { x: ["0%", "-50%"] }}
        transition={
          shouldReduceMotion
            ? undefined
            : {
                repeat: Infinity,
                ease: "linear",
                duration: 18,
              }
        }
      >
        {[0, 1].map((group) => (
          <div
            key={group}
            className="flex items-center gap-8 pr-8 font-serif text-3xl italic leading-none text-white/85 max-md:gap-6 max-md:pr-6 max-md:text-xl"
          >
            {projectNames.map((project) => (
              <span key={`${group}-${project}`} className="shrink-0">
                {project}
              </span>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

const avatarImages = [
  "https://framerusercontent.com/images/75ILrhKQhUkwU1dH15BUDezAQ.png",
  "https://framerusercontent.com/images/EgbF2rgcHm4Q19cR6VXfj7f5awk.png",
  "https://framerusercontent.com/images/etglVFVv5e7VnmUVyHsNK3oyIbI.png",
  "https://framerusercontent.com/images/Y3PGv0d0lyAiS8gk3emx3d41fvU.png",
  "https://framerusercontent.com/images/kpYj3BEOGRfBZXfMd4dgKyI0.png",
];

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set([".hero-media-box", ".hero-copy"], { autoAlpha: 1, clearProps: "transform" });
        return;
      }

      gsap.set(".hero-media-box", { autoAlpha: 0, y: -34 });
      gsap.set(".hero-copy", { autoAlpha: 0, y: 18 });

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .to(".hero-media-box", {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          stagger: 0.08,
        })
        .to(
          ".hero-copy",
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.62,
            stagger: 0.045,
          },
          "-=0.1",
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex w-full flex-col items-center justify-center px-[120px] max-md:px-6"
    >
      <div className="flex w-full max-w-[1440px] flex-col items-center gap-12 pb-[118px] pt-[180px] max-md:gap-8 max-md:pb-16 max-md:pt-[120px]">
        <div className="flex w-full max-w-[1000px] flex-col items-center gap-9 max-md:gap-6">
          <div className="hero-copy inline-flex items-center gap-2 rounded-[382px] border border-white bg-white px-4 py-2">
            <span
              className="h-[9px] w-[6px] rounded-full"
              style={{ backgroundColor: "rgb(12, 179, 0)" }}
            />
            <span className="text-base">Get Started for free!</span>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              Open{" "}
            </h1>
            <Slideshow className="hero-media-box" />
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              <span className="text-black/50">Diagram</span>
            </h1>
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              <span className="text-black/50">for Every </span>
            </h1>
            <ProjectNames className="hero-media-box" />
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              Open Source Project
            </h1>
          </div>

          <p className="hero-copy max-w-[434px] text-center text-base leading-[1.7]">
            We help open source maintainers generate beautiful, accurate documentation — fast and
            automatically.
          </p>
        </div>

        <div className="hero-copy flex items-center gap-4 max-md:flex-col">
          <div className="inline-flex items-center gap-6 rounded-[33px] bg-white p-2">
            <a
              href="/import/github"
              className="relative isolate inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
            >
              <ButtonShaderTexture />
              Import From GitHub
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>

          <div className="flex flex-col items-start gap-0.5">
            <div className="relative h-8 w-[135px]">
              {avatarImages.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="absolute h-[31px] w-[31px] rounded-full border border-white"
                  style={{ left: `${i * 25}px` }}
                />
              ))}
            </div>
            <span className="text-xs">Trusted by Maintainers</span>
          </div>
        </div>
      </div>
    </section>
  );
}
