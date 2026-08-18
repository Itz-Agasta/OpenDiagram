import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { assetUrl } from "#/lib/utils/site";

/**
 * Source assets (natural sizes / aspect):
 * 1: 2022×1046 (~1.93)  2: 1902×969 (~1.96)  3: 3958×1724 (~2.30)
 * 4: 1746×1058 (~1.65)  5: 2858×1560 (~1.83)
 *
 * Frame aspect tracks the active slide so cover fills edge-to-edge with no
 * letterbox bars and no crop on the current image.
 */
const SLIDES = [
  {
    src: assetUrl("/marketing/slideshow/example-1.png"),
    alt: "OpenDiagram architecture example 1",
    width: 2022,
    height: 1046,
  },
  {
    src: assetUrl("/marketing/slideshow/example-2.png"),
    alt: "OpenDiagram architecture example 2",
    width: 1902,
    height: 969,
  },
  {
    src: assetUrl("/marketing/slideshow/example-3.png"),
    alt: "OpenDiagram architecture example 3",
    width: 3958,
    height: 1724,
  },
  {
    src: assetUrl("/marketing/slideshow/example-4.png"),
    alt: "OpenDiagram architecture example 4",
    width: 1746,
    height: 1058,
  },
  {
    src: assetUrl("/marketing/slideshow/example-5.png"),
    alt: "OpenDiagram architecture example 5",
    width: 2858,
    height: 1560,
  },
] as const;

const INTERVAL_MS = 3500;

export function FeatureHeroSlideshow() {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const active = SLIDES[index];

  useEffect(() => {
    if (shouldReduceMotion || isPaused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [shouldReduceMotion, isPaused]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className="relative mx-auto max-w-[1260px] overflow-hidden rounded-[14px] border border-black/[0.08] bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.08)] md:p-3"
    >
      <div className="flex h-9 items-center gap-2 px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.15em] text-black/38">
          OpenDiagram canvas
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-[8px] bg-[#f4f4f2] transition-[aspect-ratio] duration-500 ease-in-out motion-reduce:transition-none"
        style={{ aspectRatio: `${active.width} / ${active.height}` }}
      >
        {SLIDES.map((slide, imageIndex) => {
          const isActive = imageIndex === index;
          const isNext = imageIndex === (index + 1) % SLIDES.length;
          if (!isActive && !isNext) return null;

          return (
            <div
              key={slide.src}
              className="absolute inset-0 transition-opacity duration-700 ease-in-out motion-reduce:transition-none"
              style={{
                opacity: isActive ? 1 : 0,
                transitionDuration: shouldReduceMotion ? "0ms" : "700ms",
              }}
              aria-hidden={!isActive}
            >
              <img
                src={slide.src}
                alt={isActive ? slide.alt : ""}
                width={slide.width}
                height={slide.height}
                sizes="(min-width: 1280px) 1236px, (min-width: 768px) 90vw, 100vw"
                className="h-full w-full object-cover object-center"
                loading={isActive && index === 0 ? "eager" : "lazy"}
                {...(isActive && index === 0 ? { fetchPriority: "high" } : {})}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5 pb-0.5 pt-1">
        {SLIDES.map((slide, dotIndex) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Show example ${dotIndex + 1}`}
            aria-current={dotIndex === index ? "true" : undefined}
            onClick={() => setIndex(dotIndex)}
            className="h-1.5 rounded-full transition-[width,background-color] cursor-pointer w-1.5 bg-black/20 hover:bg-black/35 aria-current:w-4 aria-current:bg-black/75"
          />
        ))}
      </div>
    </div>
  );
}
