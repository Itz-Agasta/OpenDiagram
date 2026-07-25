import type { Metadata } from "next";
import Link from "next/link";
import { GithubToWorkspaceIllustration } from "@/components/marketing/github-to-workspace-illustration";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ProcessCardsFan } from "@/components/marketing/process-cards-fan";
import { assetUrl } from "@/lib/site";

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
        url: assetUrl("/brand/mascot.png"),
        alt: "OpenDiagram mascot for GitHub-to-architecture workspace",
      },
    ],
  },
};

const importStepCards = [
  {
    number: "1",
    title: "Connect GitHub",
    description:
      "Authorize GitHub for repository access. OpenDiagram currently lists public repositories available to your account.",
    rotation: -5,
  },
  {
    number: "2",
    title: "Choose the codebase",
    description:
      "Search by owner and repository name, then select the project whose architecture you want to understand.",
    rotation: 9,
  },
  {
    number: "3",
    title: "Open the workspace",
    description:
      "OpenDiagram reads repository structure, detects services and dependencies, and prepares a project for generated diagrams and documentation.",
    rotation: -3,
  },
] as const;

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
      <section className="px-6 pb-12 pt-20 md:px-12 md:pb-16 md:pt-28 lg:px-[120px]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:gap-12">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">
              Architecture from existing code
            </p>
            <h1 className="mt-7 max-w-[930px] text-balance text-[50px] font-medium leading-[0.94] tracking-[-0.04em] text-[#1a1a1a] md:text-[76px] lg:text-[92px]">
              Turn a GitHub repository into an{" "}
              <span className="font-excali font-normal">architecture workspace.</span>
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

        <div className="mx-auto mt-12 w-full max-w-[1050px] md:mt-16">
          <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
            <div className="mb-1 flex h-8 items-center gap-1.5 px-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
            </div>
            <GithubToWorkspaceIllustration />
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-[120px] lg:py-36">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[0.55fr_1.45fr]">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/42">
              Repository import flow
            </p>
            <h2 className="max-w-[820px] text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
              Trace the system without reconstructing it by hand.
            </h2>
          </div>

          <div className="mt-16 md:mt-20">
            <ProcessCardsFan cards={importStepCards} variant="middle-down" />
          </div>
        </div>
      </section>

      <section className="px-3 md:px-6">
        <div className="mx-auto max-w-[1500px] rounded-[18px] bg-[#f4f3ef] px-6 py-20 md:px-12 lg:px-[96px] lg:py-28">
          <div className="mx-auto grid max-w-[1260px] gap-12 lg:grid-cols-12">
            <h2 className="text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px] lg:col-span-7">
              A map to question—not a claim that{" "}
              <span className="font-excali font-normal">the code explains itself.</span>
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
                className="inline-flex text-sm font-semibold text-black transition-opacity hover:opacity-55"
              >
                Explore editable diagram features&nbsp; →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 pt-24 md:px-12 lg:px-[120px] lg:pt-32">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">
            Repository-import questions
          </p>
          <div className="mt-8 space-y-10">
            {questions.map((item) => (
              <article key={item.question} className="grid gap-5 md:grid-cols-2">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">{item.question}</h2>
                <p className="max-w-[560px] leading-[1.7] text-black/58">{item.answer}</p>
              </article>
            ))}
          </div>
          <Link
            href="/ai-diagram-generator"
            className="mt-12 inline-flex text-sm font-semibold transition-opacity hover:opacity-55"
          >
            No repository yet? Generate a diagram from a prompt&nbsp; →
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
