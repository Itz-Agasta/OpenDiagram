import Image from "next/image";

type FeatureMediaProps =
  | {
      kind: "prompt";
      src: string;
      alt: string;
      prompt: string;
      requirements: string[];
    }
  | { kind: "image"; src: string; alt: string; width?: number; height?: number };

export function FeatureMedia({ media }: { media: FeatureMediaProps }) {
  if (media.kind === "prompt") {
    return (
      <div className="relative min-h-[560px] overflow-hidden rounded-[16px] bg-[#1a1a1a] p-4 md:min-h-[680px] md:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:64px_64px]"
        />
        <div className="relative z-20 w-full max-w-[390px] rounded-[14px] border border-white/12 bg-[#242424] p-6 text-white shadow-[0_28px_80px_rgba(0,0,0,0.35)] md:w-[43%] md:p-7">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/42">
              System prompt
            </p>
            <span className="h-2 w-2 rounded-full bg-[#0cb300]" aria-label="Ready" />
          </div>
          <p className="mt-5 text-lg font-semibold leading-[1.4] text-white/90">{media.prompt}</p>
          <ul className="mt-6 space-y-3 text-sm leading-[1.5] text-white/58">
            {media.requirements.map((requirement) => (
              <li key={requirement} className="flex gap-2.5">
                <span className="mt-[0.48em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0cb300]" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 -mt-2 ml-auto w-[96%] overflow-hidden rounded-[12px] border border-white/12 bg-[#ededeb] p-2 shadow-[0_28px_90px_rgba(0,0,0,0.4)] md:absolute md:bottom-8 md:right-8 md:mt-0 md:w-[73%]">
          <div className="mb-2 flex h-7 items-center gap-1.5 px-2">
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-black/38">
              Editable canvas
            </span>
          </div>
          <Image
            src={media.src}
            alt={media.alt}
            width={1920}
            height={1080}
            sizes="(min-width: 1024px) 50vw, 90vw"
            className="h-auto w-full rounded-[8px]"
          />
        </div>
      </div>
    );
  }

  return (
    <Image
      src={media.src}
      alt={media.alt}
      width={media.width ?? 1920}
      height={media.height ?? 1080}
      sizes="(min-width: 1024px) 65vw, 100vw"
      className="h-auto w-full rounded-[14px] shadow-[0_2px_4px_rgba(25,25,24,0.08),0_24px_55px_-26px_rgba(25,25,24,0.34)] ring-1 ring-black/[0.06]"
    />
  );
}
