import { MarketingPage } from "@/components/marketing/marketing-page";

export const LEGAL_CONTACT_EMAIL = "admin@opendiagram.ink";
const LEGAL_UPDATED = "September 27, 2026";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <MarketingPage>
      <article className="px-6 pb-24 pt-20 md:px-12 md:pt-28 lg:px-[120px]">
        <div className="mx-auto w-full max-w-[760px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4a2c]">Legal</p>
          <h1 className="mt-6 text-[44px] font-medium leading-[1] tracking-[-0.04em] md:text-[64px]">
            {title}
          </h1>
          <p className="mt-5 text-sm text-black/50">Last updated {LEGAL_UPDATED}</p>
          <div className="mt-14 space-y-12 text-[17px] leading-[1.75] text-black/70 [&_a]:text-[#1a1a1a] [&_a]:underline [&_a]:underline-offset-4 [&_li]:mt-2 [&_strong]:font-semibold [&_strong]:text-[#1a1a1a] [&_ul]:list-disc [&_ul]:pl-5">
            {children}
          </div>
        </div>
      </article>
    </MarketingPage>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#1a1a1a]">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
