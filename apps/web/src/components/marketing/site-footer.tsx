import Link from "next/link";
import { WaitlistForm } from "@/components/landing/waitlist-form";
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
    <a href={href} className="transition-opacity hover:opacity-70">
      {children}
    </a>
  ) : (
    <Link href={href} className="transition-opacity hover:opacity-70">
      {children}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative isolate mt-24 min-h-[620px] overflow-hidden bg-[#ff4a2c] px-6 pb-8 pt-16 text-white md:px-12 md:pt-20 lg:px-[90px]">
      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] gap-14 lg:grid-cols-[1.1fr_2.9fr] lg:gap-24">
        <div>
          <h2 className="max-w-[440px] text-[30px] font-medium leading-[1.08] tracking-[-0.04em] md:text-[40px]">
            Turn the idea
            <br />
            into a Vibe Diagram.
          </h2>
          <p className="mt-6 max-w-[420px] text-base leading-[1.55] text-white/70 md:text-[17px]">
            Describe what you are thinking, see it take shape, and keep editing as the idea evolves.
          </p>
          <div className="mt-8 max-w-[440px]">
            <WaitlistForm />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4">
          {columns.map((column) => (
            <div key={column.label}>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/55">
                {column.label}
              </p>
              <nav
                className="mt-6 flex flex-col items-start gap-3 text-base md:text-[17px]"
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
            <div className="mt-6 flex gap-4 text-base md:text-[17px]" aria-label="Social links">
              <a
                href={GITHUB_URL}
                aria-label="GitHub"
                className="transition-opacity hover:opacity-70"
              >
                GitHub
              </a>
              <a
                href="mailto:support@opendiagram.ink"
                aria-label="Email"
                className="transition-opacity hover:opacity-70"
              >
                Email
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[-28px] flex justify-center overflow-hidden whitespace-nowrap text-[clamp(92px,18vw,230px)] font-semibold leading-none tracking-[-0.06em] text-white/20">
        OpenDiagram.
      </div>
      <p className="absolute bottom-8 right-6 z-20 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 md:right-12 lg:right-[90px]">
        © 2026 · OpenDiagram · All rights reserved
      </p>
    </footer>
  );
}
