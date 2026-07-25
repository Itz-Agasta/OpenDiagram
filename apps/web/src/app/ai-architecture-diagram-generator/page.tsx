import type { Metadata } from "next";
import Link from "next/link";
import { FeatureMedia } from "@/components/marketing/feature-media";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "AI Architecture Diagram Generator",
  description:
    "Describe a software system in plain language and turn it into an editable architecture diagram. Review services, connections, and data flows in OpenDiagram.",
  alternates: { canonical: "/ai-architecture-diagram-generator" },
  openGraph: {
    type: "website",
    url: "/ai-architecture-diagram-generator",
    title: "AI Architecture Diagram Generator | OpenDiagram",
    description:
      "Start with a system prompt, generate a visual architecture draft, and keep editing it as the design evolves.",
    images: [
      {
        url: "/slideshow/diagram_sample.png",
        alt: "AI-generated software architecture diagram open for editing in OpenDiagram",
      },
    ],
  },
};

const promptIngredients = [
  {
    title: "Describe the behavior",
    description:
      "Explain what enters the system, what needs to happen, and where the result should go.",
  },
  {
    title: "Name real constraints",
    description:
      "Include expected scale, latency, reliability, security, or cost requirements that affect the design.",
  },
  {
    title: "Set technical boundaries",
    description:
      "Call out required platforms, services, protocols, or existing components the draft must account for.",
  },
];

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

export default function AIArchitectureDiagramGeneratorPage() {
  return (
    <MarketingPage>
      <section className="px-6 pb-16 pt-20 md:px-12 md:pb-20 md:pt-28 lg:px-[120px]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#087d00]">
              From prompt to system map
            </p>
            <h1 className="mt-7 max-w-[900px] text-balance text-[50px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[76px] lg:text-[92px]">
              Turn a system prompt into an{" "}
              <span className="font-serif font-normal italic">editable architecture diagram.</span>
            </h1>
          </div>
          <div className="max-w-[470px] lg:justify-self-end">
            <p className="text-lg leading-[1.7] text-black/60">
              Describe how your software should behave. OpenDiagram turns the requirements into a
              visual draft you can inspect, rearrange, and refine with AI.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
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
      </section>

      <section className="px-3 md:px-6">
        <div className="mx-auto max-w-[1500px]">
          <FeatureMedia
            media={{
              kind: "prompt",
              src: "/slideshow/diagram_sample.png",
              alt: "Architecture draft generated from a detailed software system prompt",
              prompt: "Design a scalable, event-driven notification system on AWS.",
              requirements: [
                "Accept events from multiple products",
                "Route email, SMS, and push independently",
                "Retry failed deliveries safely",
                "Keep delivery status observable",
              ],
            }}
          />
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-[120px] lg:py-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="grid gap-10 lg:grid-cols-[0.55fr_1.45fr]">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/42">
              A stronger starting point
            </p>
            <h2 className="max-w-[820px] text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
              Write the system you mean—not the boxes you expect to see.
            </h2>
          </div>

          <div className="mt-20 grid gap-12 md:grid-cols-3">
            {promptIngredients.map((item, index) => (
              <article
                key={item.title}
                className={`border-t border-black/18 pt-6 ${index === 1 ? "md:mt-12" : index === 2 ? "md:mt-24" : ""}`}
              >
                <p className="font-mono text-[10px] text-[#087d00]">0{index + 1}</p>
                <h3 className="mt-8 text-[26px] font-semibold leading-[1.08] tracking-[-0.035em]">
                  {item.title}
                </h3>
                <p className="mt-4 leading-[1.7] text-black/58">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-3 md:px-6">
        <div className="mx-auto max-w-[1500px] rounded-[18px] bg-[#f4f3ef] px-6 py-20 md:px-12 lg:px-[96px] lg:py-28">
          <div className="mx-auto grid max-w-[1260px] gap-12 lg:grid-cols-2">
            <h2 className="max-w-[580px] text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
              AI makes the first draft faster.{" "}
              <span className="font-serif font-normal italic">Your team makes it trustworthy.</span>
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
                className="inline-flex border-b border-black pb-1 text-sm font-semibold text-black transition-opacity hover:opacity-55"
              >
                Already have a codebase? Start from GitHub&nbsp; →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 pt-24 md:px-12 lg:px-[120px] lg:pt-32">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#087d00]">
            Prompt-to-diagram questions
          </p>
          <div className="mt-8 divide-y divide-black/18 border-y border-black/18">
            {questions.map((item) => (
              <article key={item.question} className="grid gap-5 py-8 md:grid-cols-2">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">{item.question}</h2>
                <p className="max-w-[560px] leading-[1.7] text-black/58">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
