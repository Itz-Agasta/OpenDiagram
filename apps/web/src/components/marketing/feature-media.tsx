import Image from "next/image";

type FeatureMediaProps =
  | {
      kind: "prompt";
      src: string;
      alt: string;
      prompt: string;
      requirements?: string[];
    }
  | { kind: "image"; src: string; alt: string; width?: number; height?: number }
  | {
      kind: "video";
      src: string;
      alt: string;
      poster?: string;
    };

const mediaFrameClassName =
  "h-auto w-full rounded-[14px] shadow-[0_2px_4px_rgba(25,25,24,0.08),0_24px_55px_-26px_rgba(25,25,24,0.34)] ring-1 ring-black/[0.06]";

export function SystemPromptCard({
  prompt,
  requirements = [],
  className,
}: {
  prompt: string;
  requirements?: string[];
  className?: string;
}) {
  return (
    <div
      className={`w-full rounded-[14px] border border-black/[0.08] bg-white p-6 text-[#1a1a1a] shadow-[0_18px_50px_rgba(0,0,0,0.08)] md:p-7 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/42">
          System prompt
        </p>
        <span className="h-2 w-2 rounded-full bg-[#0cb300]" aria-label="Ready" />
      </div>
      <p className="mt-5 text-lg font-semibold leading-[1.4] text-black/88">{prompt}</p>
      {requirements.length > 0 ? (
        <ul className="mt-6 space-y-3 text-sm leading-[1.5] text-black/55">
          {requirements.map((requirement) => (
            <li key={requirement} className="flex gap-2.5">
              <span className="mt-[0.48em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0cb300]" />
              <span>{requirement}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CanvasFrame({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-black/[0.06] bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.1)]">
      <div className="mb-2 flex h-8 items-center gap-2 px-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-black/38">
          Editable canvas
        </span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={1920}
        height={1080}
        sizes="(min-width: 1024px) 80vw, 100vw"
        className="h-auto w-full rounded-[8px]"
        priority={priority}
      />
    </div>
  );
}

export function FeatureMedia({ media }: { media: FeatureMediaProps }) {
  if (media.kind === "video") {
    return (
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster={media.poster}
        aria-label={media.alt}
        className={`aspect-video bg-[#1a1a1a] object-cover ${mediaFrameClassName}`}
      >
        <source src={media.src} type="video/mp4" />
      </video>
    );
  }

  if (media.kind === "prompt") {
    return (
      <div className="grid gap-6 lg:grid-cols-[0.38fr_0.62fr] lg:items-start lg:gap-8">
        <SystemPromptCard prompt={media.prompt} requirements={media.requirements} />
        <CanvasFrame src={media.src} alt={media.alt} priority />
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
      className={mediaFrameClassName}
    />
  );
}
