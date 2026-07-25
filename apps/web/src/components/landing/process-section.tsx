"use client";

import { ProcessCardsFan } from "@/components/marketing/process-cards-fan";
import { ScrollReveal } from "./scroll-reveal";

interface PrincipleProps {
  paddingTop: string;
  title: string;
  description: string;
}

function Principle({ paddingTop, title, description }: PrincipleProps) {
  return (
    <div className="flex w-full flex-col gap-6 max-lg:pt-0!" style={{ paddingTop }}>
      <p className="text-base leading-[1.7]">{description}</p>
      <div className="flex flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-black/50">OpenDiagram principle</span>
      </div>
    </div>
  );
}

const processCards = [
  {
    number: "1",
    title: "Describe",
    description:
      "Explain the behavior, scale, constraints, and technology behind the system you want to design.",
    rotation: -5,
  },
  {
    number: "2",
    title: "Shape",
    description:
      "OpenDiagram turns your intent into an editable visual draft with services, flows, and system context.",
    rotation: 9,
  },
  {
    number: "3",
    title: "Keep It Alive",
    description:
      "Refine the diagram with AI, connect decisions and context, and evolve it alongside the system.",
    rotation: -3,
  },
] as const;

export function ProcessSection() {
  return (
    <section className="flex w-full flex-col items-center justify-center px-[120px] max-lg:px-12 max-md:px-6">
      <div className="flex w-full max-w-[1440px] flex-col items-start gap-[60px] py-[120px] max-lg:py-20 max-md:py-16">
        <ScrollReveal className="flex w-full flex-col items-center gap-2.5 overflow-hidden">
          <div className="relative z-10 inline-flex items-center gap-6 rounded-full px-6 max-sm:gap-4 max-sm:px-0">
            <span className="h-px w-[69px] shrink-0 bg-black/50 max-sm:w-10" />
            <span className="font-excali text-2xl">How Vibe Diagramming Works</span>
            <span className="h-px w-[69px] shrink-0 bg-black/50 max-sm:w-10" />
          </div>
          <h2 className="w-full text-center text-[48px] font-bold leading-[1.4] -tracking-[0.04em] max-md:text-3xl">
            From rough idea to living architecture
          </h2>
        </ScrollReveal>

        <ProcessCardsFan cards={processCards} />

        <div className="flex w-full items-start gap-24 pt-12 max-lg:flex-col max-lg:gap-12 max-lg:pt-4">
          <ScrollReveal className="w-full" delay={0.12}>
            <Principle
              paddingTop="80px"
              title="Start with intent, not boxes"
              description="Describe the behavior you want before arranging components. OpenDiagram gives the conversation a visual form your team can inspect together."
            />
          </ScrollReveal>
          <span className="w-px self-stretch bg-black/25 max-lg:hidden" />
          <ScrollReveal className="w-full" delay={0.2}>
            <Principle
              paddingTop="240px"
              title="Stay editable from the first draft"
              description="Move components, redraw connections, and explore alternatives with AI. Your architecture remains a workspace—not a generated screenshot."
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
