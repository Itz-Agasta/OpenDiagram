import Image from "next/image";
import { assetUrl } from "@/lib/site";
import { LensScene } from "./lens-scene";
import { SpectrumBackdrop } from "./spectrum-backdrop";

/**
 * Card and brand shared by the auth pages. `lens`: the mascot scene with the card on the
 * left (sign in / sign up). `spectrum`: the scene's rainbow wall as a
 * drifting shader, card centred (password reset).
 */
export function AuthShell({
  backdrop = "lens",
  children,
}: {
  backdrop?: "lens" | "spectrum";
  children: React.ReactNode;
}) {
  return (
    <div
      className="stage"
      data-layout={backdrop === "lens" ? "scene" : "center"}
      data-accent="lime"
    >
      {backdrop === "lens" ? <LensScene /> : <SpectrumBackdrop />}
      <div className="pane-form">
        <div className="auth-card">
          <div className="brand">
            <Image src={assetUrl("/brand/mascot.png")} alt="" width={32} height={32} />
            <div className="brand-name">OpenDiagram</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
