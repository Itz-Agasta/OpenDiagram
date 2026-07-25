import type { Metadata } from "next";
import Image from "next/image";
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
    <MarketingPage>
      <section className="px-6 pb-20 pt-20 md:px-12 md:pb-28 md:pt-28 lg:px-[120px]">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#087d00]">
            Why OpenDiagram exists
          </p>
          <div className="mt-7 grid gap-10 lg:grid-cols-[1.45fr_0.55fr] lg:items-end">
            <h1 className="max-w-[920px] text-balance text-[50px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[76px] lg:text-[92px]">
              Architecture should stay{" "}
              <span className="font-serif font-normal italic">open to change.</span>
            </h1>
            <p className="max-w-[470px] text-lg leading-[1.7] text-black/60">
              Software systems evolve after the whiteboard meeting. OpenDiagram keeps the diagram,
              the reasoning, and the editing surface together so architecture can evolve with the
              code.
            </p>
          </div>
        </div>
      </section>

      <section className="px-3 md:px-6">
        <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[18px] bg-[#1a1a1a] px-6 py-16 text-white md:px-12 md:py-20 lg:px-[96px] lg:py-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:72px_72px]"
          />
          <div className="relative mx-auto grid max-w-[1260px] gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#54d94b]">
                The problem
              </p>
              <h2 className="mt-6 text-balance text-[38px] font-medium leading-[1] tracking-[-0.04em] md:text-[58px]">
                System knowledge is scattered.
              </h2>
              <p className="mt-7 max-w-[510px] text-lg leading-[1.7] text-white/58">
                Screenshots, repositories, documents, and chat history each hold a different
                fragment. OpenDiagram brings those materials into one architecture workspace.
              </p>
            </div>
            <div className="overflow-hidden rounded-[14px] border border-white/12 bg-[#262626] p-2 lg:col-span-7">
              <div className="flex h-8 items-center gap-1.5 px-2">
                <span className="h-2 w-2 rounded-full bg-white/18" />
                <span className="h-2 w-2 rounded-full bg-white/18" />
                <span className="h-2 w-2 rounded-full bg-[#0cb300]" />
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-white/36">
                  The system, connected
                </span>
              </div>
              <Image
                src="/feature-media/opendiagram-generated-architecture-3x.png"
                alt="OpenDiagram architecture showing the product's connected services"
                width={2670}
                height={1440}
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="h-auto w-full rounded-[8px]"
              />
            </div>
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
                <span className="font-serif font-normal italic">see and change it.</span>
              </h2>
            </div>
            <div className="space-y-14 lg:col-span-6 lg:col-start-7">
              {principles.map((principle) => (
                <article key={principle.title} className="border-t border-black/18 pt-6">
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

          <div className="mt-28 grid gap-8 border-y border-black/18 py-8 md:grid-cols-[1fr_auto] md:items-center">
            <dl className="grid grid-cols-3 gap-6">
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">
                  Status
                </dt>
                <dd className="mt-2 text-sm font-semibold">Early</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">
                  License
                </dt>
                <dd className="mt-2 text-sm font-semibold">Apache 2.0</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">
                  Source
                </dt>
                <dd className="mt-2 text-sm font-semibold">GitHub</dd>
              </div>
            </dl>
            <a
              href={GITHUB_URL}
              className="inline-flex min-h-12 w-fit items-center justify-center rounded-full bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black/76"
            >
              Inspect the source&nbsp; ↗
            </a>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
