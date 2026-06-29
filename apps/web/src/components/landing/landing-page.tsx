import { Header } from "./header";
import { HeroSection } from "./hero-section";
import { PortfolioSection } from "./portfolio-section";
import { IntroSection } from "./intro-section";
import { ProcessSection } from "./process-section";
import { FaqSection } from "./faq-section";
import { Footer } from "./footer";
import { GodRaysBackground } from "./god-rays-background";

const companyLogos = [
  { src: "https://framerusercontent.com/images/NyE8ivetFVedlhRFXSLKE3o2UQ.png", top: "3363px", w: "89px", h: "24px" },
  { src: "https://framerusercontent.com/images/cDwUYRUu0bWTfGZuUM12HxkjI.png", top: "3419px", w: "91px", h: "24px" },
  { src: "https://framerusercontent.com/images/anSZNN7fGoEdX3mAZqhSwQaM4ss.png", top: "3475px", w: "82px", h: "24px" },
  { src: "https://framerusercontent.com/images/ojnFiiYTPrzf8HIoDCllaecKY.png", top: "3531px", w: "99px", h: "24px" },
  { src: "https://framerusercontent.com/images/dzg1J44BI5dpWdBoC8R2tz22VaU.png", top: "3587px", w: "95px", h: "24px" },
  { src: "https://framerusercontent.com/images/mHQUH6yOSg3jhkv1LrZbAdmXMQ.png", top: "3643px", w: "85px", h: "24px" },
];

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
            style={{ width: "591px", top: "-209px", left: "34%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.03)" }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{ width: "582px", top: "-209px", left: "-2%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.03)" }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{ width: "441px", top: "-209px", left: "34%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.03)" }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{ width: "683px", top: "-209px", left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.03)" }}
          />
          <div
            className="absolute h-[1269px] max-w-[960px]"
            style={{ width: "426px", top: "-209px", left: "49%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.03)" }}
          />
        </div>

        {companyLogos.map((logo, i) => (
          <img
            key={`logo-${i}`}
            src={logo.src}
            alt=""
            className="pointer-events-none fixed z-0 opacity-25"
            style={{ width: logo.w, height: logo.h, top: logo.top, left: "-24px" }}
          />
        ))}

        <GodRaysBackground />

        <div className="relative z-10">
          <HeroSection />
          <PortfolioSection />
          <IntroSection />
          <ProcessSection />
          <FaqSection />
          <Footer />
        </div>
      </main>
    </div>
  );
}
