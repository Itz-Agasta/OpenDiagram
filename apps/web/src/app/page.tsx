import { LandingPage } from "@/components/landing/landing-page";
import { SmoothScrollProvider } from "@/components/smooth-scroll-provider";

export default function Home() {
  return (
    <SmoothScrollProvider>
      <LandingPage />
    </SmoothScrollProvider>
  );
}
