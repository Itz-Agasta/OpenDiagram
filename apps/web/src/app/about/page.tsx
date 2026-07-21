import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";
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
    <MarketingPage className="bg-white">
      <section className="px-6 pb-24 pt-20 md:px-12 md:pb-32 md:pt-28 lg:px-[120px]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-y-12 lg:grid-cols-12">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-black/45 lg:col-span-3 lg:pt-4">
            Why OpenDiagram exists
          </p>
          <h1 className="text-balance text-[56px] font-medium leading-[0.9] -tracking-[0.07em] md:text-[88px] lg:col-span-10 lg:col-start-2 lg:text-[116px]">
            Architecture should stay{" "}
            <span className="block pl-[9%] text-[#ff4a2c]">open to change.</span>
          </h1>
          <p className="max-w-[650px] text-lg leading-[1.7] text-black/62 md:text-xl lg:col-span-6 lg:col-start-3 lg:mt-6">
            Software systems evolve after the whiteboard meeting. OpenDiagram keeps the diagram, the
            reasoning, and the editing surface together so architecture can evolve with the code.
          </p>
          <dl className="grid grid-cols-3 gap-5 border-t border-black/20 pt-5 lg:col-span-4 lg:col-start-9 lg:mt-6">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/40">
                Status
              </dt>
              <dd className="mt-2 text-sm font-semibold">Early</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/40">
                License
              </dt>
              <dd className="mt-2 text-sm font-semibold">Apache 2.0</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/40">
                Source
              </dt>
              <dd className="mt-2 text-sm font-semibold">GitHub</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="px-6 py-20 md:px-12 lg:px-[120px] lg:py-28">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 border-y border-black/20 py-10 md:py-14 lg:grid-cols-12 lg:gap-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#ff4a2c] lg:col-span-2">
            The problem
          </p>
          <h2 className="text-balance text-[42px] font-medium leading-[1] -tracking-[0.052em] md:text-[62px] lg:col-span-6">
            System knowledge gets scattered across screenshots, repositories, documents, and chat
            history.
          </h2>
          <div className="flex flex-col justify-between gap-12 lg:col-span-3 lg:col-start-10">
            <p className="text-lg leading-[1.75] text-black/60">
              OpenDiagram brings those materials into one architecture workspace. Start from a
              prompt or repository, shape the visual draft, and keep the context close enough for
              the next engineer to understand.
            </p>
            <a
              href={GITHUB_URL}
              className="inline-flex w-fit border-b border-black pb-1 text-sm font-semibold transition-colors hover:text-black/55"
            >
              Inspect the source on GitHub&nbsp; ↗
            </a>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-[120px] lg:py-36">
        <div className="mx-auto w-full max-w-[1200px]">
          <header className="max-w-[820px]">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-black/45">
              The principles
            </p>
            <h2 className="mt-8 text-balance text-[46px] font-medium leading-[0.98] -tracking-[0.057em] md:text-[70px]">
              Useful architecture tools should make thinking visible.
            </h2>
          </header>

          <div className="mt-24 space-y-20 md:space-y-28">
            {principles.map((principle, index) => (
              <article
                key={principle.title}
                className={`grid gap-8 border-t border-black/20 pt-7 md:grid-cols-[0.9fr_1.1fr] ${
                  index === 0
                    ? "max-w-[920px]"
                    : index === 1
                      ? "ml-auto max-w-[1040px]"
                      : "ml-[7%] max-w-[860px]"
                }`}
              >
                <h3 className="text-balance text-[32px] font-semibold leading-[1.06] -tracking-[0.04em] md:text-[44px]">
                  {principle.title}
                </h3>
                <p className="max-w-[520px] text-lg leading-[1.75] text-black/58 md:pt-1">
                  {principle.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
