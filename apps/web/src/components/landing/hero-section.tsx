"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import gsap from "gsap";

const slideshowImages = [
  "/slideshow/vibediagram1.png",
  "/slideshow/diagram2.webp",
  "/slideshow/diagram3.webp",
  "/slideshow/diagram4.webp",
];

const systemConcepts = ["APIs", "Services", "Queues", "Databases", "Events"];

function Slideshow({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) return;

    const timer = setInterval(() => setIndex((i) => (i + 1) % slideshowImages.length), 3000);
    return () => clearInterval(timer);
  }, [shouldReduceMotion]);

  return (
    <span
      aria-hidden="true"
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
    </span>
  );
}

function SystemConcepts({ className = "" }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-[108px] w-[220px] rotate-2 items-center overflow-hidden rounded-[36px] border-2 border-black bg-[#262626] max-md:h-20 max-md:w-40 ${className}`}
    >
      <motion.span
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
          <span
            key={group}
            className="flex items-center gap-8 pr-8 font-serif text-3xl italic leading-none tracking-[0.06em] text-white/85 max-md:gap-6 max-md:pr-6 max-md:text-xl"
          >
            {systemConcepts.map((concept) => (
              <span key={`${group}-${concept}`} className="shrink-0">
                {concept}
              </span>
            ))}
          </span>
        ))}
      </motion.span>
    </span>
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (shouldReduceMotion) {
      video.pause();
      video.currentTime = 0;
      video.load();
      return;
    }

    video.defaultMuted = true;
    video.muted = true;

    void video.play().catch(() => undefined);
  }, [shouldReduceMotion]);

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
            <span className="text-base">Open source · Built for system design</span>
          </div>

          <h1 className="hero-copy flex w-full flex-wrap items-center justify-center gap-3 text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
            <span>Vibe diagram</span>
            <Slideshow className="hero-media-box" />
            <span className="text-black/50">your next</span>
            <SystemConcepts className="hero-media-box" />
            <span>system.</span>
          </h1>

          <p className="hero-copy max-w-[620px] text-center text-base leading-[1.7]">
            Turn a rough idea into editable software architecture. Describe the system, shape it
            with AI, and keep every decision connected as the design evolves.
          </p>
        </div>

        <div className="hero-copy flex max-w-[760px] flex-col items-center gap-4">
          <Link
            href="/dashboard"
            className="group inline-flex h-14 cursor-pointer items-center justify-center gap-3 rounded-full bg-black px-12 text-base font-medium text-white shadow-[0_16px_60px_-36px_rgba(0,0,0,0.55)] transition-all hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
          >
            Create Your Vibe Diagram
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-300 ease-out group-hover:translate-x-2"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>

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
            <span className="text-xs">Built for teams designing systems</span>
          </div>
        </div>

        <div className="hero-copy mt-12 w-full max-w-[1200px] overflow-hidden rounded-lg border border-black/10 shadow-2xl">
          <video
            ref={videoRef}
            className="aspect-video w-full rounded-lg bg-white object-cover"
            autoPlay={!shouldReduceMotion}
            loop
            muted
            playsInline
            preload="auto"
            poster="/hero-media/opendiagram-creation-flow-poster.jpg"
            aria-label="Creating and editing a chat app architecture diagram in OpenDiagram"
            onLoadedData={() => {
              if (!shouldReduceMotion) {
                void videoRef.current?.play().catch(() => undefined);
              }
            }}
          >
            <source src="/hero-media/opendiagram-creation-flow-trimmed.webm" type="video/webm" />
            <source src="/hero-media/opendiagram-creation-flow-trimmed.mp4" type="video/mp4" />
          </video>
        </div>
      </div>
    </section>
  );
}
