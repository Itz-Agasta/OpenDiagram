import type { Metadata } from "next";
import { FeatureMedia } from "@/components/marketing/feature-media";
import { FeatureNav } from "@/components/marketing/feature-nav";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Vibe Diagram Features — Editable System Diagrams",
  description:
    "Turn a system prompt into an editable Vibe Diagram, refine services and connections on a visual canvas, and explore the open-source OpenDiagram workspace.",
  alternates: { canonical: "/features" },
  openGraph: {
    type: "website",
    url: "/features",
    title: "OpenDiagram Vibe Diagram Features",
    description:
      "Describe a system, generate a Vibe Diagram, and keep refining the visual on an editable canvas.",
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
    id: "prompt",
    label: "Generate",
    title: "Prompt to architecture draft",
    description:
      "Describe system behavior, scale, constraints, and technologies in plain language. OpenDiagram maps that intent into services and flows.",
    media: {
      kind: "prompt" as const,
      src: "/slideshow/diagram_sample.png",
      alt: "Vibe Diagram showing an AWS publish-subscribe system generated from a written prompt",
      prompt: "Design a scalable event-driven notification system on AWS.",
      requirements: [
        "Accept events from a publisher application",
        "Fan messages out through an SNS topic",
        "Support HTTP, queue, and serverless consumers",
        "Show the main services and message flow",
      ],
    },
  },
  {
    id: "canvas",
    label: "Shape",
    title: "A real editing canvas",
    description:
      "Move components, rename services, redraw connections, and add the details the first draft missed. The result is a diagram, not an image.",
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
    label: "Map the system",
    title: "Map services, requests, and data flows",
    description:
      "Use Vibe Diagrams to explore service boundaries, request paths, data movement, cloud resources, and the relationships that are hard to explain in prose.",
    media: {
      kind: "image" as const,
      src: "/example-media/collaborative-ai-workspace.jpg",
      alt: "Editable Vibe Diagram showing software services and their data flows in OpenDiagram",
    },
  },
  {
    id: "ownership",
    label: "Inspect and own",
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
    <MarketingPage className="bg-white">
      <section className="px-6 pb-20 pt-20 md:px-12 md:pb-28 md:pt-28 lg:px-[120px]">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#ff4a2c]">
            Why Open Diagram
          </p>
          <h1 className="mt-8 max-w-[980px] text-balance text-[46px] font-medium leading-[0.94] -tracking-[0.065em] md:text-[70px] lg:text-[88px]">
            From system intent to an <span className="text-[#ff4a2c]">editable map.</span>
          </h1>
        </div>
      </section>

      <section className="px-6 pb-28 md:px-12 lg:px-[120px]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 lg:grid-cols-[0.3fr_0.7fr] lg:gap-14">
          <aside className="h-fit lg:sticky lg:top-24 lg:self-start">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">
              Explore the workspace
            </p>
            <FeatureNav items={showcaseItems.map(({ id, title }) => ({ id, title }))} />
          </aside>

          <div className="min-w-0">
            <p className="mb-10 max-w-[560px] text-lg leading-[1.7] text-black/62 md:text-xl">
              OpenDiagram turns a written system idea into an editable Vibe Diagram, then gives you
              a visual canvas for shaping the services, connections, and flows.
            </p>

            <div className="space-y-24 lg:space-y-36">
              {showcaseItems.map((item) => (
                <article
                  key={item.id}
                  id={item.id}
                  className="scroll-mt-24 border-t border-black/15 pt-8"
                >
                  <div className="mb-8 grid gap-6 md:grid-cols-[0.8fr_1.2fr] md:items-end">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#ff4a2c]">
                        {item.label}
                      </p>
                      <h2 className="mt-4 text-balance text-[34px] font-medium leading-[1] -tracking-[0.045em] md:text-[48px]">
                        {item.title}
                      </h2>
                    </div>
                    <p className="max-w-[450px] leading-[1.7] text-black/58 md:justify-self-end">
                      {item.description}
                    </p>
                  </div>

                  <div>
                    <FeatureMedia media={item.media} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
