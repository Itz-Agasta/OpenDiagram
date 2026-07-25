import type { Metadata } from "next";
import { GitBranch, Scale, Sparkles } from "lucide-react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ScatteredKnowledgeIllustration } from "@/components/marketing/scattered-knowledge-illustration";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About OpenDiagram",
  description:
    "Learn why OpenDiagram is building an open-source, editable AI workspace for software architecture and system design.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: "/about",
    title: "About OpenDiagram",
    description:
      "An open-source AI workspace where software architecture stays editable, explainable, and owned by engineers.",
  },
};

const principles = [
  {
    title: "Editable from the first draft",
    description:
      "A generated diagram should begin a design conversation, not end it. Every output opens on a canvas where the structure can be reviewed and changed.",
  },
  {
    title: "Engineer judgment stays in the loop",
    description:
      "OpenDiagram creates working drafts. Engineers still validate constraints, tradeoffs, failure modes, and the architecture that reaches production.",
  },
  {
    title: "Open source first",
    description:
      "The code is available under Apache 2.0. Teams can inspect it, contribute to it, and run the workspace on infrastructure they control.",
  },
];

export default function AboutPage() {
  return (
    <MarketingPage>
      <section className="px-6 pb-20 pt-20 md:px-12 md:pb-28 md:pt-28 lg:px-[120px]">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">
            Why OpenDiagram exists
          </p>
          <div className="mt-7 grid gap-10 lg:grid-cols-[1.45fr_0.55fr] lg:items-end">
            <h1 className="max-w-[920px] text-balance text-[50px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[76px] lg:text-[92px]">
              Architecture should stay{" "}
              <span className="font-excali font-normal">open to change.</span>
            </h1>
            <p className="max-w-[470px] text-lg leading-[1.7] text-black/60">
              Software systems evolve after the whiteboard meeting. OpenDiagram keeps the diagram,
              the reasoning, and the editing surface together so architecture can evolve with the
              code.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-12 md:py-28 lg:px-[120px]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/42">
              The problem
            </p>
            <h2 className="mt-6 text-balance text-[38px] font-medium leading-[1] tracking-[-0.04em] text-[#1a1a1a] md:text-[58px]">
              System knowledge is scattered.
            </h2>
            <p className="mt-7 max-w-[510px] text-lg leading-[1.7] text-black/58">
              Screenshots, repositories, documents, and chat history each hold a different fragment.
              OpenDiagram brings those materials into one architecture workspace.
            </p>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.06)] lg:col-span-7">
            <div className="mb-1 flex h-8 items-center gap-1.5 px-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
            </div>
            <ScatteredKnowledgeIllustration />
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-[120px] lg:py-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/42">
                What we believe
              </p>
              <h2 className="mt-7 text-balance text-[42px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
                Thinking becomes useful when the team can{" "}
                <span className="font-excali font-normal">see and change it.</span>
              </h2>
            </div>
            <div className="space-y-14 lg:col-span-6 lg:col-start-7">
              {principles.map((principle) => (
                <article key={principle.title} className="pt-6">
                  <h3 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.035em] md:text-[34px]">
                    {principle.title}
                  </h3>
                  <p className="mt-4 max-w-[590px] text-lg leading-[1.7] text-black/58">
                    {principle.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-5 py-4 md:mt-20">
            <dl className="flex flex-wrap items-center gap-x-7 gap-y-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="size-4 shrink-0 text-[#ff4a2c]" aria-hidden="true" />
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">
                    Status
                  </dt>
                  <dd className="mt-1 text-sm font-semibold">Early</dd>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Scale className="size-4 shrink-0 text-[#ff4a2c]" aria-hidden="true" />
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">
                    License
                  </dt>
                  <dd className="mt-1 text-sm font-semibold">Apache 2.0</dd>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <GitBranch className="size-4 shrink-0 text-[#ff4a2c]" aria-hidden="true" />
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">
                    Source
                  </dt>
                  <dd className="mt-1 text-sm font-semibold">GitHub</dd>
                </div>
              </div>
            </dl>
            <a
              href={GITHUB_URL}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-[#1a1a1a] px-5 text-sm font-semibold text-white transition-colors hover:bg-black/76"
            >
              Inspect the source&nbsp; ↗
            </a>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
