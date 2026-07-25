import type { Metadata } from "next";
import Link from "next/link";
import { FeatureMedia } from "@/components/marketing/feature-media";
import { FeatureNav } from "@/components/marketing/feature-nav";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Editable Software Architecture Diagrams",
  description:
    "Edit software architecture diagrams on a visual canvas. Move services, redraw connections, refine designs with AI, and keep ownership of your OpenDiagram workspace.",
  alternates: { canonical: "/features" },
  openGraph: {
    type: "website",
    url: "/features",
    title: "Editable Software Architecture Diagrams | OpenDiagram",
    description:
      "Move components, redraw connections, and refine software architecture without starting over.",
    images: [
      {
        url: "/dashboard-od.png",
        alt: "OpenDiagram dashboard for starting an architecture diagram",
      },
    ],
  },
};

const showcaseItems = [
  {
    id: "canvas",
    label: "Edit directly",
    title: "Change the diagram itself",
    description:
      "Move components, rename services, redraw connections, and add what the first draft missed. Work with architecture objects instead of a flattened screenshot.",
    media: {
      kind: "image" as const,
      src: "/hero-media/opendiagram-creation-flow-trimmed-ezgif.com-video-to-gif-converter.gif",
      alt: "OpenDiagram demo showing a Vibe Diagram being created and edited on the canvas",
      width: 1280,
      height: 720,
    },
  },
  {
    id: "context",
    label: "See the system",
    title: "Make relationships easier to inspect",
    description:
      "Show service boundaries, request paths, data movement, cloud resources, and the connections that disappear inside prose or presentation slides.",
    media: {
      kind: "image" as const,
      src: "/example-media/collaborative-ai-workspace.jpg",
      alt: "Editable Vibe Diagram showing software services and their data flows in OpenDiagram",
    },
  },
  {
    id: "revision",
    label: "Explore changes",
    title: "Revise without starting over",
    description:
      "Ask for another approach, revise part of the system, or add a missing requirement. Keep the useful structure while the design changes around it.",
    media: {
      kind: "image" as const,
      src: "/slideshow/diagram2.webp",
      alt: "Revised software architecture diagram on the OpenDiagram editing canvas",
    },
  },
  {
    id: "ownership",
    label: "Keep ownership",
    title: "Open source by design",
    description:
      "OpenDiagram is available under the Apache 2.0 license. Inspect the implementation, contribute improvements, or run the workspace on infrastructure you control.",
    media: {
      kind: "image" as const,
      src: "/feature-media/opendiagram-generated-architecture-3x.png",
      alt: "OpenDiagram open-source architecture connecting the Next.js web app, Hono API, AI providers, PostgreSQL, Better Auth, and diagram engine",
      width: 2670,
      height: 1440,
    },
  },
];

export default function FeaturesPage() {
  return (
    <MarketingPage>
      <section className="px-3 pt-3 md:px-6 md:pt-6">
        <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[18px] bg-[#1a1a1a] px-6 pb-10 pt-20 text-white md:px-12 md:pb-16 md:pt-28 lg:px-[96px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:72px_72px]"
          />
          <div className="relative mx-auto grid max-w-[1260px] gap-14 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#54d94b]">
                Editable architecture workspace
              </p>
              <h1 className="mt-7 max-w-[900px] text-balance text-[48px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[72px] lg:text-[88px]">
                Architecture diagrams you can{" "}
                <span className="font-serif font-normal italic">keep shaping.</span>
              </h1>
            </div>
            <div className="max-w-[450px] lg:justify-self-end">
              <p className="text-lg leading-[1.65] text-white/62">
                Correct services, reconnect flows, add context, and test how a system should evolve
                on one visual canvas.
              </p>
              <Link
                href="/dashboard"
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black transition-colors hover:bg-white/82"
              >
                Start a diagram
              </Link>
            </div>
          </div>

          <div className="relative mx-auto mt-16 max-w-[1260px] overflow-hidden rounded-[14px] border border-white/12 bg-[#262626] p-2 shadow-[0_35px_100px_rgba(0,0,0,0.42)] md:mt-24 md:p-3">
            <div className="flex h-9 items-center gap-1.5 px-3">
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.15em] text-white/36">
                OpenDiagram canvas
              </span>
            </div>
            <FeatureMedia media={showcaseItems[3].media} />
          </div>
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
                <div className="grid gap-7 border-t border-black/18 pt-7 md:grid-cols-[0.8fr_1.2fr] md:items-end">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-[#087d00]">
                      {item.label}
                    </p>
                    <h2 className="mt-5 text-balance text-[36px] font-medium leading-[1] tracking-[-0.04em] md:text-[54px]">
                      {item.title}
                    </h2>
                  </div>
                  <p className="max-w-[500px] leading-[1.7] text-black/60 md:justify-self-end">
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
