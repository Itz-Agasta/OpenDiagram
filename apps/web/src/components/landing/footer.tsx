import { FooterTextureBackground } from "./footer-texture-background";

function FooterBackground() {
  return <div className="pointer-events-none absolute inset-0 z-0 bg-zinc-950" />;
}

export function Footer() {
  return (
    <footer className="relative mx-2 flex w-[calc(100%-1rem)] flex-col items-center justify-end overflow-hidden rounded-[24px] border-8 border-[#d9d9d9] bg-black px-28 max-md:px-6">
      <FooterBackground />
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-10"
        style={{
          backgroundImage:
            "url(https://framerusercontent.com/images/6mcf62RlDfRfU61Yg5vb2pefpi4.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "200px",
        }}
      />
      <FooterTextureBackground />

      <div className="relative z-10 flex min-h-[560px] w-full max-w-[1366px] flex-col items-start justify-end gap-9 py-20">
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-9 rounded-2xl px-9 py-[60px] text-center max-md:px-0">
          <div className="relative z-10 inline-flex max-w-full items-center justify-center gap-6 overflow-hidden rounded-full px-6">
            <span className="h-px w-[69px] bg-white/50" />
            <span className="font-serif text-2xl italic leading-[1.2] text-white">
              Now in Beta, Free for Open Source
            </span>
            <span className="h-px w-[69px] bg-white/50" />
          </div>

          <h2 className="w-full text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] text-white max-md:text-5xl max-sm:text-4xl">
            Your Repo, Fully Documented
          </h2>

          <div className="flex w-full max-w-[620px] flex-col items-center justify-center gap-2.5 overflow-hidden">
            <p className="text-center text-2xl font-normal leading-[1.6] -tracking-[0.02em] text-white/80 max-md:text-xl">
              Connect your GitHub and get architecture diagrams, API docs, and a full README generated in seconds.
            </p>
          </div>

          <div className="inline-flex items-center justify-center gap-2 overflow-visible rounded-[90px] bg-white/30 p-2">
            <a
              href="/import/github"
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:opacity-90"
            >
              Import From GitHub
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-2.5 overflow-hidden max-md:flex-col max-md:items-start max-md:gap-6">
          <div className="inline-flex h-11 items-center justify-center overflow-hidden border-y border-white/50 px-4">
            <span className="text-base leading-[1.7] text-white">© Team Vyse, 2026</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-9 text-base leading-[1.7] text-white max-md:justify-start">
            <a href="https://github.com" className="transition-colors hover:text-white/70">
              GitHub
            </a>
            <a href="mailto:hello@opendiagram.dev" className="transition-colors hover:text-white/70">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
