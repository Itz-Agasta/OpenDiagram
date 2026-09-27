import Image from "next/image";
import { assetUrl } from "@/lib/site";
import { LensScene } from "./lens-scene";

/** The lens backdrop, frosted card and brand shared by sign in / sign up and password reset. */
export function AuthShell({ xray, children }: { xray?: string; children: React.ReactNode }) {
  return (
    <div className="stage" data-layout="scene" data-accent="lime">
      <LensScene xray={xray} />
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
