import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "GitHub to Architecture Diagram Generator",
  description:
    "Connect a public GitHub repository, detect its services and dependencies, and prepare an editable architecture workspace in OpenDiagram.",
  alternates: { canonical: "/github-to-architecture-diagram-generator" },
  openGraph: {
    type: "website",
    url: "/github-to-architecture-diagram-generator",
    title: "GitHub to Architecture Diagram Generator | OpenDiagram",
    description:
      "Move from repository structure to an architecture workspace your team can inspect and refine.",
    images: [
      {
        url: "/feature-media/opendiagram-generated-architecture-3x.png",
        alt: "OpenDiagram architecture view generated from repository context",
      },
    ],
  },
};

const importSteps = [
  {
    number: "01",
    title: "Connect GitHub",
    description:
      "Authorize GitHub for repository access. OpenDiagram currently lists public repositories available to your account.",
  },
  {
    number: "02",
    title: "Choose the codebase",
    description:
      "Search by owner and repository name, then select the project whose architecture you want to understand.",
  },
  {
    number: "03",
    title: "Open the workspace",
    description:
      "OpenDiagram reads repository structure, detects services and dependencies, and prepares a project for generated diagrams and documentation.",
  },
];

const questions = [
  {
    question: "Which GitHub repositories can I import?",
    answer:
      "The current import flow supports public repositories. Connect GitHub, then choose from the repositories available in the picker or enter an owner/repository name.",
  },
  {
    question: "Does OpenDiagram change my repository?",
    answer:
      "No. Repository import reads project context to prepare an OpenDiagram workspace. It does not commit changes or write files back to GitHub.",
  },
  {
    question: "What should engineers review after import?",
    answer:
      "Check detected service boundaries, dependencies, runtime relationships, external systems, and anything inferred from conventions rather than explicit configuration.",
  },
];

export default function GitHubToArchitectureDiagramGeneratorPage() {
  return (
    <MarketingPage>
      <section className="px-6 pb-16 pt-20 md:px-12 md:pb-20 md:pt-28 lg:px-[120px]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#087d00]">
              Architecture from existing code
            </p>
            <h1 className="mt-7 max-w-[930px] text-balance text-[50px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[76px] lg:text-[92px]">
              Turn a GitHub repository into an{" "}
              <span className="font-serif font-normal italic">architecture workspace.</span>
            </h1>
          </div>
          <div className="max-w-[450px] lg:justify-self-end">
            <p className="text-lg leading-[1.7] text-black/60">
              Move beyond folder trees and scattered README files. Import a public repository,
              identify its main parts, and review the result as a connected system.
            </p>
            <Link
              href="/import/github"
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black/76"
            >
              Import a repository
            </Link>
          </div>
        </div>
      </section>

      <section className="px-3 md:px-6">
        <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[18px] bg-[#1a1a1a] p-4 md:p-8 lg:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:72px_72px]"
          />
          <div className="relative mx-auto max-w-[1260px]">
            <div className="grid gap-3 pb-4 font-mono text-[9px] uppercase tracking-[0.15em] text-white/42 sm:grid-cols-3">
              <span>github.com / repository</span>
              <span className="sm:text-center">Read-only context</span>
              <span className="text-[#54d94b] sm:text-right">Editable workspace ready</span>
            </div>
            <div className="overflow-hidden rounded-[14px] border border-white/12 bg-[#262626] p-2 shadow-[0_32px_100px_rgba(0,0,0,0.45)]">
              <div className="flex h-9 items-center gap-1.5 px-3">
                <span className="h-2 w-2 rounded-full bg-white/18" />
                <span className="h-2 w-2 rounded-full bg-white/18" />
                <span className="h-2 w-2 rounded-full bg-[#0cb300]" />
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-white/36">
                  Architecture workspace
                </span>
              </div>
              <Image
                src="/feature-media/opendiagram-generated-architecture-3x.png"
                alt="Software services and dependencies mapped in an OpenDiagram architecture workspace"
                width={2670}
                height={1440}
                sizes="(min-width: 1280px) 1260px, 100vw"
                className="h-auto w-full rounded-[8px]"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-[120px] lg:py-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="grid gap-10 lg:grid-cols-[0.55fr_1.45fr]">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/42">
              Repository import flow
            </p>
            <h2 className="max-w-[820px] text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
              Trace the system without reconstructing it by hand.
            </h2>
          </div>

          <div className="mt-20 grid gap-12 md:grid-cols-3">
            {importSteps.map((step, index) => (
              <article
                key={step.number}
                className={`border-t border-black/18 pt-6 ${index === 1 ? "md:mt-12" : index === 2 ? "md:mt-24" : ""}`}
              >
                <p className="font-mono text-[10px] text-[#087d00]">{step.number}</p>
                <h3 className="mt-8 text-[26px] font-semibold leading-[1.08] tracking-[-0.035em]">
                  {step.title}
                </h3>
                <p className="mt-4 leading-[1.7] text-black/58">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-3 md:px-6">
        <div className="mx-auto max-w-[1500px] rounded-[18px] bg-[#f4f3ef] px-6 py-20 md:px-12 lg:px-[96px] lg:py-28">
          <div className="mx-auto grid max-w-[1260px] gap-12 lg:grid-cols-12">
            <h2 className="text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px] lg:col-span-7">
              A map to question—not a claim that{" "}
              <span className="font-serif font-normal italic">the code explains itself.</span>
            </h2>
            <div className="space-y-6 text-lg leading-[1.75] text-black/60 lg:col-span-4 lg:col-start-9">
              <p>
                Repositories reveal structure, but architecture also lives in runtime behavior,
                operational constraints, external services, and decisions that may never appear in
                source files.
              </p>
              <p>
                Use the generated workspace to find those gaps. Correct the draft, add missing
                context, and keep the system view useful as the code changes.
              </p>
              <Link
                href="/features"
                className="inline-flex border-b border-black pb-1 text-sm font-semibold text-black transition-opacity hover:opacity-55"
              >
                Explore editable diagram features&nbsp; →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 pt-24 md:px-12 lg:px-[120px] lg:pt-32">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#087d00]">
            Repository-import questions
          </p>
          <div className="mt-8 divide-y divide-black/18 border-y border-black/18">
            {questions.map((item) => (
              <article key={item.question} className="grid gap-5 py-8 md:grid-cols-2">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">{item.question}</h2>
                <p className="max-w-[560px] leading-[1.7] text-black/58">{item.answer}</p>
              </article>
            ))}
          </div>
          <Link
            href="/ai-architecture-diagram-generator"
            className="mt-12 inline-flex border-b border-black pb-1 text-sm font-semibold transition-opacity hover:opacity-55"
          >
            No repository yet? Generate a diagram from a prompt&nbsp; →
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
