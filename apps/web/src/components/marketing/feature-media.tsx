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
      <div className="relative min-h-[500px] overflow-hidden md:min-h-[600px]">
        <div className="relative z-20 w-full max-w-[350px] bg-white p-6 shadow-[0_18px_45px_rgba(25,25,24,0.12)] md:w-[45%] md:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/42">Prompt</p>
          <p className="mt-4 text-lg font-semibold leading-[1.35] text-black/88">{media.prompt}</p>
          <ul className="mt-5 space-y-2 text-sm leading-[1.45] text-black/62">
            {media.requirements.map((requirement, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="mt-[0.48em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff4a2c]" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 -mt-5 ml-auto w-[94%] rotate-[1.5deg] bg-white p-2 shadow-[0_2px_4px_rgba(25,25,24,0.08),0_22px_46px_-20px_rgba(25,25,24,0.28),18px_34px_72px_-38px_rgba(25,25,24,0.3)] ring-1 ring-[rgba(25,25,24,0.06)] md:absolute md:bottom-7 md:right-3 md:mt-0 md:w-[76%]">
          <Image
            src={media.src}
            alt={media.alt}
            width={1920}
            height={1080}
            sizes="(min-width: 1024px) 50vw, 90vw"
            className="h-auto w-full"
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
      className="h-auto w-full rounded-[18px] shadow-[0_2px_4px_rgba(25,25,24,0.08),0_22px_46px_-20px_rgba(25,25,24,0.28),18px_34px_72px_-38px_rgba(25,25,24,0.3)] ring-1 ring-[rgba(25,25,24,0.06)]"
    />
  );
}
