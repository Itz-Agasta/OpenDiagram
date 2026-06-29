"use client";

import { motion } from "framer-motion";

const caseStudyImages = [
  "https://framerusercontent.com/images/TWgBR6dpy8VfcVcGIy2oyBYzyY.jpg",
  "https://framerusercontent.com/images/J4Ox47KYv4g8Lb2C0PXNkjDaA.jpg",
  "https://framerusercontent.com/images/wo0P2ApHuac8yCSOoIU4GYSCkOc.png",
  "https://framerusercontent.com/images/9nNEv94U4EwW3ZkcswuOBMt2jk.jpg",
  "https://framerusercontent.com/images/cpbJvQoTTkomFOd8RSNsHF3b8.jpg",
  "https://framerusercontent.com/images/670uUrkwoRnzhCl9b3kEMwUmgE4.jpg",
  "https://framerusercontent.com/images/TWgBR6dpy8VfcVcGIy2oyBYzyY.jpg",
  "https://framerusercontent.com/images/J4Ox47KYv4g8Lb2C0PXNkjDaA.jpg",
  "https://framerusercontent.com/images/wo0P2ApHuac8yCSOoIU4GYSCkOc.png",
  "https://framerusercontent.com/images/9nNEv94U4EwW3ZkcswuOBMt2jk.jpg",
  "https://framerusercontent.com/images/cpbJvQoTTkomFOd8RSNsHF3b8.jpg",
  "https://framerusercontent.com/images/670uUrkwoRnzhCl9b3kEMwUmgE4.jpg",
];

function VerticalTicker({ images, speed }: { images: string[]; speed: number }) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <motion.div
        className="flex flex-col gap-12"
        animate={{ y: [`0%`, `-${(images.length / 2) * 300}px`] }}
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
      >
        {images.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="h-[200px] w-full flex-shrink-0 overflow-hidden rounded-xl"
          >
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function PortfolioSection() {
  const ticker1 = caseStudyImages.slice(0, 6);
  const ticker2 = caseStudyImages.slice(6);

  return (
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

        <motion.a
          href="/"
          className="absolute left-1/2 top-1/2 z-10 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-all hover:scale-110 hover:bg-white/20"
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
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M12 11v6" />
            <path d="M9 14h6" />
          </svg>
        </motion.a>

        <a
          href="/"
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center text-sm text-white/70"
        >
          <span className="font-serif italic">See Recent Work</span>
        </a>
      </div>
    </section>
  );
}
