import { Header } from "#/components/ui/header";
import { Footer } from "#/components/ui/footer";
import { LenisProvider } from "#/hooks/useLenisProvider";

export function MarketingPage({
  children,
  className = "",
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <LenisProvider>
      <div
        className={`min-h-screen bg-[#f7f7f5] text-[#1a1a1a] selection:bg-[#ff4a2c] selection:text-white ${className}`}
      >
        <a
          href="#main-content"
          className="sr-only z-50 bg-white px-4 py-3 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Header />
        <main id="main-content" className="overflow-x-clip pt-20">
          {children}
        </main>
        <Footer />
      </div>
    </LenisProvider>
  );
}
