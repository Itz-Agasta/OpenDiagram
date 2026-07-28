import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SystemPromptCard } from "@/components/marketing/feature-media";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ProcessCardsFan } from "@/components/marketing/process-cards-fan";
import { assetUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "AI System Architecture Diagram Generator | OpenDiagram",
  description:
    "Describe a software system in plain language and get an editable architecture diagram — services, connections, and data flows, generated from a prompt.",
  alternates: { canonical: "/ai-architecture-diagram-generator" },
  openGraph: {
    type: "website",
    url: "/ai-architecture-diagram-generator",
    title: "AI System Architecture Diagram Generator | OpenDiagram",
    description:
      "Describe a software system in plain language and get an editable architecture diagram — services, connections, and data flows, generated from a prompt.",
    images: [
      {
        url: assetUrl("/marketing/examples/main-example.jpg"),
        alt: "AI-generated software architecture diagram open for editing in OpenDiagram",
      },
    ],
  },
  keywords: [
    "AI system architecture diagram generator",
    "system architecture diagram generator from prompt",
    "software architecture diagram generator",
    "architecture diagram from text",
    "AI architecture diagram generator",
    "OpenDiagram",
  ],
};

const promptIngredientCards = [
  {
    number: "1",
    title: "Describe the behavior",
    description:
      "Explain what enters the system, what needs to happen, and where the result should go.",
    rotation: -5,
  },
  {
    number: "2",
    title: "Name real constraints",
    description:
      "Include expected scale, latency, reliability, security, or cost requirements that affect the design.",
    rotation: 9,
  },
  {
    number: "3",
    title: "Set technical boundaries",
    description:
      "Call out required platforms, services, protocols, or existing components the draft must account for.",
    rotation: -3,
  },
] as const;

const questions = [
  {
    question: "What should I include in an architecture prompt?",
    answer:
      "Start with the system’s job, important users or clients, expected traffic, required technologies, and constraints. Concrete behavior produces a more useful draft than a list of product names.",
  },
  {
    question: "Can I edit the generated architecture diagram?",
    answer:
      "Yes. The result opens on a visual canvas where you can move components, rename services, redraw connections, and continue refining the design.",
  },
  {
    question: "Is an AI-generated diagram production-ready?",
    answer:
      "Treat it as a working draft. Engineers should still validate security boundaries, failure modes, capacity assumptions, and technology choices before using it as authoritative architecture.",
  },
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: questions.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function AIArchitectureDiagramGeneratorPage() {
  return (
    <MarketingPage>
      <section className="px-6 pb-16 pt-20 md:px-12 md:pb-20 md:pt-28 lg:px-[120px]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:gap-12">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">
              From prompt to system map
            </p>
            <h1 className="mt-7 max-w-[900px] text-balance text-[50px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[76px] lg:text-[92px]">
              Turn a system prompt into an{" "}
              <span className="font-excali font-normal">editable architecture diagram.</span>
            </h1>
          </div>

          <div className="flex flex-col gap-6 lg:max-w-[400px] lg:justify-self-end">
            <SystemPromptCard prompt="Generate an internal system architecture diagram" />
            <div>
              <p className="text-lg leading-[1.7] text-black/60">
                Describe how your software should behave. OpenDiagram turns the requirements into a
                visual draft you can inspect, rearrange, and refine with AI.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black/76"
                >
                  Create a diagram
                </Link>
                <Link
                  href="/features"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-black/20 px-6 text-sm font-semibold transition-colors hover:bg-black/[0.04]"
                >
                  Explore the canvas
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-3 md:px-6">
        {/* 70% of prior max-w-[1500px] → 1050px, centered */}
        <div className="mx-auto w-full max-w-[1050px] overflow-hidden rounded-[12px] border border-black/[0.06] bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.1)]">
          <div className="mb-2 flex h-8 items-center gap-2 px-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-black/38">
              Editable canvas
            </span>
          </div>
          <Image
            src={assetUrl("/marketing/examples/main-example.jpg")}
            alt="Architecture draft generated from a software system prompt"
            width={1920}
            height={1080}
            sizes="(min-width: 1050px) 1050px, 100vw"
            className="h-auto w-full rounded-[8px]"
            priority
          />
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-[120px] lg:py-36">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[0.55fr_1.45fr]">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/42">
              A stronger starting point
            </p>
            <h2 className="max-w-[820px] text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
              Write the system you mean—not the boxes you expect to see.
            </h2>
          </div>

          <div className="mt-16 md:mt-20">
            <ProcessCardsFan cards={promptIngredientCards} variant="middle-down" />
          </div>
        </div>
      </section>

      <section className="px-3 md:px-6">
        <div className="mx-auto max-w-[1500px] rounded-[18px] bg-[#f4f3ef] px-6 py-20 md:px-12 lg:px-[96px] lg:py-28">
          <div className="mx-auto grid max-w-[1260px] gap-12 lg:grid-cols-2">
            <h2 className="max-w-[580px] text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
              AI makes the first draft faster.{" "}
              <span className="font-excali font-normal">Your team makes it trustworthy.</span>
            </h2>
            <div className="max-w-[570px] space-y-6 text-lg leading-[1.75] text-black/60 lg:pt-2">
              <p>
                Use the generated map to expose assumptions early: missing dependencies, unclear
                service boundaries, risky request paths, or requirements that do not fit together.
              </p>
              <p>
                Then edit the canvas and ask AI to explore alternatives. The diagram stays open to
                engineering judgment instead of becoming a finished-looking answer nobody reviewed.
              </p>
              <Link
                href="/github-to-architecture-diagram-generator"
                className="inline-flex text-sm font-semibold text-black transition-opacity hover:opacity-55"
              >
                Already have a codebase? Start from GitHub&nbsp; →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 pt-24 md:px-12 lg:px-[120px] lg:pt-32">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">
            Prompt-to-diagram questions
          </p>
          <div className="mt-8 space-y-10">
            {questions.map((item) => (
              <article key={item.question} className="grid gap-5 md:grid-cols-2">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">{item.question}</h2>
                <p className="max-w-[560px] leading-[1.7] text-black/58">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData).replace(/</g, "\\u003c"),
        }}
      />
    </MarketingPage>
  );
}
