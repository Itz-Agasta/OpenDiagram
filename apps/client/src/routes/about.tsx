import { createFileRoute } from "@tanstack/react-router";
import { GitBranch, Scale, Sparkles } from "lucide-react";
import { MarketingPage } from "#/components/marketing/marketing-page";
import { ScatteredKnowledgeIllustration } from "#/components/marketing/scattered-knowledge-illustration";
import { GITHUB_URL, SITE_URL } from "#/lib/utils/site";
import { MarketingButton } from "#/components/ui/button";

const aboutStructuredData = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: `${SITE_URL.href}about`,
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "OpenDiagram",
    applicationCategory: "DesignApplication",
    operatingSystem: "Web",
    license: "Apache 2.0",
    offers: {
      "@type": "Offer",
      price: "0",
    },
  },
};

const principles = [
  {
    title: "Diagrams are for editing, not just exporting.",
    description:
      "Static png files and read-only exports age immediately. Your layout engine should treat nodes, flows, and relationships as databases you query, modify, and expand long after the first draft.",
  },
  {
    title: "Bring your own keys and compute.",
    description:
      "Your API usage should stay under your control. We connect directly to the model vendors you already pay for—avoiding proprietary vendor lock-in or premium platform markups on tokens.",
  },
  {
    title: "Open formats survive proprietary tools.",
    description:
      "Your documents belong to you. OpenDiagram stores workspaces as semantic JSON, uses standard layouts, and avoids proprietary lock-in. If you want to take your diagrams elsewhere, you can.",
  },
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About | OpenDiagram" },
      {
        name: "description",
        content:
          "OpenDiagram is an open-source, editable architecture workspace. Learn why it exists and how it's built.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
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
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <MarketingButton text="Inspect the source ↗" color="black" />
            </a>
          </div>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(aboutStructuredData).replace(/</g, "\\u003c"),
        }}
      />
    </MarketingPage>
  );
}
