import { Header } from "./header";
import { HeroSection } from "./hero-section";
import { PortfolioSection } from "./portfolio-section";
import { IntroSection } from "./intro-section";
import { ProcessSection } from "./process-section";
import { FaqSection } from "./faq-section";
import { Footer } from "./footer";
import { GodRaysBackground } from "./god-rays-background";

export function LandingPage() {
  return (
    <div className="bg-[#d9d9d9]">
      <Header />

      <main className="relative min-h-screen overflow-hidden">
        <div
          className="pointer-events-none fixed inset-0 z-50 opacity-[0.04]"
          style={{
            backgroundImage:
              "url(https://framerusercontent.com/images/6mcf62RlDfRfU61Yg5vb2pefpi4.png)",
            backgroundRepeat: "repeat",
            backgroundSize: "200px",
          }}
        />

        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{
              width: "591px",
              top: "-209px",
              left: "34%",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.03)",
            }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{
              width: "582px",
              top: "-209px",
              left: "-2%",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.03)",
            }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{
              width: "441px",
              top: "-209px",
              left: "34%",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.03)",
            }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{
              width: "683px",
              top: "-209px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.03)",
            }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{
              width: "426px",
              top: "-209px",
              left: "49%",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.03)",
            }}
          />
        </div>

        <GodRaysBackground />

        <div className="relative z-10">
          <HeroSection />
          <PortfolioSection />
          <div id="about" className="scroll-mt-20">
            <IntroSection />
          </div>
          <div id="how-it-works" className="scroll-mt-20">
            <ProcessSection />
          </div>
          <div id="faq" className="scroll-mt-20">
            <FaqSection />
          </div>
          <Footer />
        </div>
      </main>
    </div>
  );
}
