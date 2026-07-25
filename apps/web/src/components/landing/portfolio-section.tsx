"use client";

import Image from "next/image";
import Link from "next/link";
import { domAnimation, LazyMotion, m } from "motion/react";

const caseStudyImages = [
  { id: "twgbr6", src: "https://framerusercontent.com/images/TWgBR6dpy8VfcVcGIy2oyBYzyY.jpg" },
  { id: "j4ox47", src: "https://framerusercontent.com/images/J4Ox47KYv4g8Lb2C0PXNkjDaA.jpg" },
  { id: "wo0p2a", src: "https://framerusercontent.com/images/wo0P2ApHuac8yCSOoIU4GYSCkOc.png" },
  { id: "9nne89", src: "https://framerusercontent.com/images/9nNEv94U4EwW3ZkcswuOBMt2jk.jpg" },
  { id: "cpbjvq", src: "https://framerusercontent.com/images/cpbJvQoTTkomFOd8RSNsHF3b8.jpg" },
  { id: "670uur", src: "https://framerusercontent.com/images/670uUrkwoRnzhCl9b3kEMwUmgE4.jpg" },
  { id: "twgbr6-copy", src: "https://framerusercontent.com/images/TWgBR6dpy8VfcVcGIy2oyBYzyY.jpg" },
  { id: "j4ox47-copy", src: "https://framerusercontent.com/images/J4Ox47KYv4g8Lb2C0PXNkjDaA.jpg" },
  {
    id: "wo0p2a-copy",
    src: "https://framerusercontent.com/images/wo0P2ApHuac8yCSOoIU4GYSCkOc.png",
  },
  { id: "9nne89-copy", src: "https://framerusercontent.com/images/9nNEv94U4EwW3ZkcswuOBMt2jk.jpg" },
  { id: "cpbjvq-copy", src: "https://framerusercontent.com/images/cpbJvQoTTkomFOd8RSNsHF3b8.jpg" },
  {
    id: "670uur-copy",
    src: "https://framerusercontent.com/images/670uUrkwoRnzhCl9b3kEMwUmgE4.jpg",
  },
];

const TICKER_IMAGE_HEIGHT = 200;
const TICKER_GAP = 48;

function VerticalTicker({ images, speed }: { images: typeof caseStudyImages; speed: number }) {
  const loopImages = [...images, ...images];
  const tickerTravel = images.length * (TICKER_IMAGE_HEIGHT + TICKER_GAP);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <m.div
        className="flex flex-col gap-12"
        animate={{ y: [0, -tickerTravel] }}
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
      >
        {loopImages.map((image) => (
          <div
            key={image.id}
            className="relative h-[200px] w-full flex-shrink-0 overflow-hidden rounded-xl"
          >
            <Image
              src={image.src}
              alt=""
              fill
              sizes="(max-width: 768px) 50vw, 640px"
              className="object-cover"
            />
          </div>
        ))}
      </m.div>
    </div>
  );
}

export function PortfolioSection() {
  const ticker1 = caseStudyImages.slice(0, 6);
  const ticker2 = caseStudyImages.slice(6);

  return (
    <LazyMotion features={domAnimation}>
      <section className="flex w-full flex-col items-center justify-center px-[120px] max-md:px-6">
        <div className="relative flex h-[120vh] w-full max-w-[1440px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#262626]">
          <div className="absolute inset-0 z-0 flex gap-12 px-12">
            <div className="flex w-1/2 flex-col overflow-hidden">
              <VerticalTicker images={ticker1} speed={80} />
            </div>
            <div className="flex w-1/2 flex-col overflow-hidden">
              <VerticalTicker images={ticker2} speed={60} />
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <m.a
              href="/dashboard"
              aria-label="Create a new Vibe Diagram"
              className="flex h-32 w-32 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-colors hover:bg-white/20"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <path d="M12 11v6" />
                <path d="M9 14h6" />
              </svg>
            </m.a>
          </div>

          <Link
            href="/dashboard"
            className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center text-sm text-white/70"
          >
            <span className="font-excali">See Vibe Diagrams</span>
          </Link>
        </div>
      </section>
    </LazyMotion>
  );
}
