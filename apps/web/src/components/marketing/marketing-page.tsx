import { Instrument_Sans } from "next/font/google";
import { Header } from "@/components/landing/header";
import { SiteFooter } from "@/components/marketing/site-footer";

const marketingSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-marketing-sans",
  display: "swap",
});

export function MarketingPage({
  children,
  className,
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <div
      className={`${marketingSans.className} min-h-screen text-[#191918] ${className ?? "bg-[#d8d7d2]"}`}
    >
      <a
        href="#main-content"
        className="sr-only z-50 bg-white px-4 py-3 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content" className="overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
