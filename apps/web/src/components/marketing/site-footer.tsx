import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { GITHUB_URL } from "@/lib/site";

const columns = [
  {
    label: "Product",
    links: [
      ["Features", "/features"],
      ["How it works", "/#how-it-works"],
      ["GitHub import", "/import/github"],
      ["Dashboard", "/dashboard"],
    ],
  },
  {
    label: "Resources",
    links: [
      ["FAQ", "/#faq"],
      ["About", "/about"],
    ],
  },
  {
    label: "Company",
    links: [
      ["About OpenDiagram", "/about"],
      ["Contact", "mailto:support@opendiagram.ink"],
    ],
  },
];

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  return external ? (
    <a
      href={href}
      className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70 lg:min-h-0"
    >
      {children}
    </a>
  ) : (
    <Link
      href={href}
      prefetch={href === "/dashboard" ? false : undefined}
      className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70 lg:min-h-0"
    >
      {children}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative isolate mt-24 min-h-[620px] overflow-hidden bg-[#ff4a2c] px-6 pb-8 pt-16 text-white md:px-12 md:pt-20 lg:px-[90px]">
      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] gap-14 lg:grid-cols-[1.1fr_2.9fr] lg:gap-24">
        <ScrollReveal>
          <h2 className="max-w-[440px] text-[30px] font-medium leading-[1.08] tracking-[-0.04em] md:text-[40px]">
            Turn the idea
            <br />
            into a Vibe Diagram.
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-[1.55] text-white/70 md:text-[17px]">
            Describe what you are thinking, see it take shape, and keep editing as the idea evolves.
          </p>
          <div className="mt-8 max-w-[440px]">
            <Link
              href="/login?tab=signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.12} className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4">
          {columns.map((column) => (
            <div key={column.label}>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/55">
                {column.label}
              </p>
              <nav
                className="mt-6 flex flex-col items-start gap-0 text-base md:text-[17px] lg:gap-3"
                aria-label={`${column.label} links`}
              >
                {column.links.map(([label, href]) => (
                  <FooterLink key={label} href={href}>
                    {label}
                  </FooterLink>
                ))}
              </nav>
            </div>
          ))}
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/55">Connect</p>
            <div
              className="mt-6 flex flex-col items-start gap-0 text-base md:text-[17px] lg:gap-3 xl:flex-row xl:gap-4"
              aria-label="Social links"
            >
              <a
                href={GITHUB_URL}
                aria-label="GitHub"
                className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70 lg:min-h-0"
              >
                GitHub
              </a>
              <a
                href="https://discord.gg/MDE97bTpYf"
                aria-label="Discord"
                className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70 lg:min-h-0"
              >
                Discord
              </a>
              <a
                href="mailto:support@opendiagram.ink"
                aria-label="Email"
                className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70 lg:min-h-0"
              >
                Email
              </a>
            </div>
          </div>
        </ScrollReveal>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[-28px] flex justify-center overflow-hidden whitespace-nowrap text-[clamp(92px,18vw,230px)] font-semibold leading-none tracking-[-0.06em] text-white/20">
        OpenDiagram.
      </div>
      <p className="relative z-20 mt-16 max-w-[260px] font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-white/55 md:absolute md:bottom-8 md:right-12 md:mt-0 md:max-w-none lg:right-[90px]">
        © 2026 · OpenDiagram · All rights reserved
      </p>
    </footer>
  );
}
