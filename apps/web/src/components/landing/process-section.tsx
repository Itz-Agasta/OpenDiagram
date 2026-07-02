"use client";

import { motion } from "framer-motion";

interface ProcessCardProps {
  number: string;
  title: string;
  description: string;
  rotation: number;
}

function ProcessCard({ number, title, description, rotation }: ProcessCardProps) {
  return (
    <div
      className="w-full rounded-[30px] border-[10px] border-white/50"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div className="flex w-full flex-col gap-6 rounded-[20px] bg-white/80 p-8 shadow-sm backdrop-blur-sm">
        <span className="text-[72px] font-thin leading-[1.25] -tracking-[0.06em]">{number}</span>
        <h3 className="text-2xl font-bold leading-[1.6] -tracking-[0.02em]">{title}</h3>
        <p className="text-base leading-[1.7] text-black/70">{description}</p>
      </div>
    </div>
  );
}

interface TestimonyProps {
  paddingTop: string;
  quote: string;
  name: string;
  role: string;
}

function Testimony({ paddingTop, quote, name, role }: TestimonyProps) {
  return (
    <div className="flex w-full flex-col gap-6" style={{ paddingTop }}>
      <p className="text-base leading-[1.7] italic">&ldquo;{quote}&rdquo;</p>
      <div className="flex flex-col">
        <span className="font-semibold">{name}</span>
        <span className="text-sm text-black/50">{role}</span>
      </div>
    </div>
  );
}

function FirstConnector() {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="pointer-events-none absolute left-[23%] top-[17%] z-30 hidden h-[130px] w-[252px] lg:block"
      viewBox="0 0 330 170"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="142" r="10" stroke="#ff4a2c" strokeWidth="4" />
      <circle cx="308" cy="13" r="10" stroke="#ff4a2c" strokeWidth="4" />
      <motion.path
        d="M26 137C57 55 126 -6 298 12"
        stroke="#ff4a2c"
        strokeWidth="4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, delay: 0.6, ease: "easeInOut" }}
      />
    </motion.svg>
  );
}

function SecondConnector() {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.55 }}
      className="pointer-events-none absolute left-[65%] top-[47%] z-30 hidden h-[132px] w-[198px] lg:block"
      viewBox="0 0 270 180"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="14" cy="16" r="10" stroke="#ff4a2c" strokeWidth="4" />
      <circle cx="254" cy="78" r="10" stroke="#ff4a2c" strokeWidth="4" />
      <motion.path
        d="M15 28C14 82 78 88 122 78C158 70 126 45 77 83C30 119 77 160 140 139C184 124 225 101 246 86"
        stroke="#ff4a2c"
        strokeWidth="4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.35, delay: 0.7, ease: "easeInOut" }}
      />
    </motion.svg>
  );
}

export function ProcessSection() {
  return (
    <section className="flex w-full flex-col items-center justify-center px-[120px] max-md:px-6">
      <div className="flex w-full max-w-[1440px] flex-col items-start gap-[60px] py-[120px]">
        <div className="flex w-full flex-col items-center gap-2.5 overflow-hidden">
          <div className="relative z-10 inline-flex items-center gap-6 rounded-full px-6">
            <span className="h-px w-[69px] bg-black/50" />
            <span className="font-serif text-2xl italic">Our Process, Explained</span>
            <span className="h-px w-[69px] bg-black/50" />
          </div>
          <h2 className="w-full text-center text-[48px] font-bold leading-[1.4] -tracking-[0.04em] max-md:text-3xl">
            Here&apos;s how it works
          </h2>
        </div>

        <div className="relative flex w-full items-start justify-center max-md:flex-col max-md:items-center">
          <FirstConnector />
          <SecondConnector />

          <div className="relative z-10 -mr-4 flex w-[36%] flex-col gap-2.5 pt-[62px] max-md:-mr-0 max-md:mb-[-24px] max-md:w-full max-md:pt-0">
            <ProcessCard
              number="1"
              title="Connect"
              description="Link your GitHub account and select any public or private repository"
              rotation={-5}
            />
          </div>
          <div className="relative z-20 -mx-4 flex w-[36%] flex-col gap-2.5 max-md:-mx-0 max-md:mb-[-24px] max-md:w-full max-md:pt-0">
            <ProcessCard
              number="2"
              title="Analyze"
              description="Choose a plan and request as many designs as you need."
              rotation={9}
            />
          </div>
          <div className="relative z-10 -ml-4 flex w-[36%] flex-col gap-2.5 pt-16 max-md:-ml-0 max-md:w-full max-md:pt-0">
            <ProcessCard
              number="3"
              title="Get Your Designs"
              description="Download architecture diagrams, README, API docs, and everything in between"
              rotation={-3}
            />
          </div>
        </div>

        <div className="flex w-full items-start gap-24 pt-12 max-md:flex-col max-md:gap-12">
          <Testimony
            paddingTop="80px"
            quote="Open Diagram saved us hours of onboarding. New contributors understand our architecture on day one — without us writing a single doc manually."
            name="Sophie Lemaire"
            role="Product Lead at Loomi"
          />
          <span className="w-px self-stretch bg-black/25 max-md:hidden" />
          <Testimony
            paddingTop="240px"
            quote="We had zero documentation. Open Diagram scanned our repo and generated everything — diagrams, API docs, README. It actually understood our codebase."
            name="Milan Bakker"
            role="Founder of Drifted Studio"
          />
        </div>
      </div>
    </section>
  );
}
