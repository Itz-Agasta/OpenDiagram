import type { Metadata } from "next";
import Link from "next/link";
import { FlashlightScene } from "@/components/not-found/flashlight-scene";
import "./not-found.css";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="nf-stage">
      <FlashlightScene />
      <div className="nf-copy">
        <p className="nf-code">404</p>
        <h1 className="nf-title">
          This node isn&apos;t on the <em>map</em>.
        </h1>
        <p className="nf-sub">
          The link is broken or the page moved. Sweep the flashlight around, then head back.
        </p>
        <Link href="/" className="nf-cta">
          Back to home
        </Link>
      </div>
    </main>
  );
}
