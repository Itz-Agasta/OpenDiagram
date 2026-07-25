import type { Metadata } from "next";
import Link from "next/link";
import { FeatureHeroSlideshow } from "@/components/marketing/feature-hero-slideshow";
import { FeatureMedia } from "@/components/marketing/feature-media";
import { FeatureNav } from "@/components/marketing/feature-nav";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { assetUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "BYOK, ERD, Flowchart & Architecture Diagrams",
  description:
    "Bring your own AI API keys, build ERDs and flowcharts, and keep software architecture editable with project context—OpenDiagram, open source and provider-agnostic.",
  alternates: { canonical: "/features" },
  openGraph: {
    type: "website",
    url: "/features",
    title: "BYOK, ERD, Flowchart & Architecture Diagrams | OpenDiagram",
    description:
      "Connect OpenAI, Anthropic, or Gemini with your own keys. Generate ERDs and flowcharts, then evolve diagrams with retained project context.",
    images: [
      {
        url: assetUrl("/marketing/features/dashboard.png"),
        alt: "OpenDiagram dashboard for starting an architecture diagram",
      },
    ],
  },
};

const showcaseItems = [
  {
    id: "byok",
    label: "Bring your own keys",
    title: "Your providers. Your models. Your bill.",
    description:
      "Connect OpenAI, Anthropic, Gemini, or another catalog provider with an API key you already pay for. OpenDiagram encrypts keys at rest, routes generation through your default provider, and falls back to the platform model only when you have not connected one. No forced lock-in to a single vendor quota—and no mystery markup on tokens you already buy elsewhere.",
    media: {
      kind: "image" as const,
      src: assetUrl("/marketing/features/byok-illustration.jpg"),
      alt: "OpenDiagram Bring Your Own Keys illustration: AI Providers panel with OpenAI, Anthropic, and Gemini, plus a connect form for an encrypted API key",
      width: 1280,
      height: 720,
    },
  },
  {
    id: "erd",
    label: "Entity relationships",
    title: "ERD diagrams that stay editable",
    description:
      "Model tables, keys, and cardinality as first-class objects—not a one-shot image export. Generate an entity-relationship diagram from a schema description or product brief, then adjust fields, rename entities, and rewire associations when the data model shifts. OpenDiagram is built for ERD work you will open again next sprint, not archive in a slide deck.",
    media: {
      kind: "video" as const,
      src: assetUrl("/videos/od-erd-tutorial.mp4"),
      alt: "Tutorial video: generating and editing an entity-relationship diagram (ERD) in OpenDiagram",
    },
  },
  {
    id: "flowchart",
    label: "Process flows",
    title: "Flowcharts for decisions and handoffs",
    description:
      "Map onboarding paths, approval chains, incident runbooks, and API request lifecycles as flowcharts you can actually revise. Branch logic, labels, and steps stay on the canvas so product and engineering can debate the path without redrawing from a blank page. Use natural language to draft the flow, then pin the sequence that matches how the system really behaves.",
    media: {
      kind: "video" as const,
      src: assetUrl("/videos/od-flow-tutorial.mp4"),
      alt: "Tutorial video: creating and refining a process flowchart in OpenDiagram",
    },
  },
  {
    id: "context",
    label: "Project memory",
    title: "Context that carries into the next version",
    description:
      "Architecture does not freeze after the first commit. OpenDiagram keeps project context—services, prior diagram structure, and the decisions you already made—so each revision builds on what exists instead of inventing a parallel universe. Evolve diagrams as requirements change: add a service, split a domain, or reconnect a dependency without losing the thread of the system you already designed.",
    media: {
      kind: "image" as const,
      src: assetUrl("/marketing/features/memory-context.jpg"),
      alt: "OpenDiagram illustration of a software architecture diagram evolving with a Project Context panel of services, decisions, and prior structure",
      width: 1280,
      height: 720,
    },
  },
];

export default function FeaturesPage() {
  return (
    <MarketingPage>
      <section className="px-6 pb-12 pt-20 md:px-12 md:pb-16 md:pt-28 lg:px-[120px]">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="grid gap-12 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">
                Editable architecture workspace
              </p>
              <h1 className="mt-7 max-w-[900px] text-balance text-[48px] font-medium leading-[0.94] tracking-[-0.04em] text-[#1a1a1a] md:text-[72px] lg:text-[88px]">
                Architecture diagrams you can{" "}
                <span className="font-excali font-normal">keep shaping.</span>
              </h1>
            </div>
            <div className="max-w-[450px] lg:justify-self-end">
              <p className="text-lg leading-[1.65] text-black/60">
                Correct services, reconnect flows, add context, and test how a system should evolve
                on one visual canvas.
              </p>
              <Link
                href="/dashboard"
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black/76"
              >
                Start a diagram
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-12 w-full max-w-[1260px] md:mt-16">
          <FeatureHeroSlideshow />
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-[120px] lg:py-36">
        <div className="mx-auto grid w-full max-w-[1200px] gap-12 lg:grid-cols-[0.28fr_0.72fr] lg:gap-16">
          <aside className="h-fit lg:sticky lg:top-24 lg:self-start">
            <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.17em] text-black/42">
              Four parts of the workspace
            </p>
            <FeatureNav items={showcaseItems.map(({ id, title }) => ({ id, title }))} />
          </aside>

          <div className="min-w-0 space-y-24 lg:space-y-36">
            {showcaseItems.map((item, index) => (
              <article key={item.id} id={item.id} className="scroll-mt-24">
                <div className="grid gap-7 pt-7 md:grid-cols-[0.8fr_1.2fr] md:items-end">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-[#ff4a2c]">
                      {item.label}
                    </p>
                    <h2 className="mt-5 text-balance text-[36px] font-medium leading-[1] tracking-[-0.04em] md:text-[54px]">
                      {item.title}
                    </h2>
                  </div>
                  <p className="max-w-[520px] leading-[1.7] text-black/60 md:justify-self-end">
                    {item.description}
                  </p>
                </div>
                <div className={`mt-10 ${index % 2 === 1 ? "md:ml-[7%]" : ""}`}>
                  <FeatureMedia media={item.media} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
