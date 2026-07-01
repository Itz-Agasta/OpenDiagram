"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";

const filters = ["All", "Architecture", "API maps", "README", "Shared"];

const menuItems = [
  { label: "Diagrams", href: "/dashboard" },
  { label: "Repositories", href: "/import/github" },
  { label: "Docs & READMEs", href: "/dashboard" },
];

const secondaryMenuItems = [
  { label: "Settings", href: "/dashboard" },
  { label: "Sign out", href: "/" },
];

export default function DashboardPage() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState(filters[0]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function createDiagram() {
    router.push(`/workspace/${nanoid(10)}`);
  }

  return (
    <main className="relative min-h-screen bg-white text-od-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-45 [background-image:radial-gradient(rgba(0,0,0,0.04)_1px,transparent_1px)] [background-size:4px_4px]"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 md:px-12 lg:px-[120px]">
        <header className="flex items-center justify-between pt-6">
          <Link
            href="/"
            className="flex h-11 items-center rounded-full bg-white px-6 text-[16px] font-bold text-od-ink"
          >
            OpenDiagram
          </Link>

          <nav ref={menuRef} className="relative">
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-full bg-white active:translate-y-px"
            >
              <span
                className={`block h-[2px] w-4 rounded bg-od-ink transition duration-200 ${
                  menuOpen ? "translate-y-[5px] rotate-45" : ""
                }`}
              />
              <span
                className={`block h-[2px] w-4 rounded bg-od-ink transition duration-200 ${
                  menuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-[2px] w-4 rounded bg-od-ink transition duration-200 ${
                  menuOpen ? "-translate-y-[5px] -rotate-45" : ""
                }`}
              />
            </button>

            <div
              hidden={!menuOpen}
              className="absolute right-0 top-[calc(100%+12px)] z-50 w-[30vw] min-w-[200px] rounded-lg border border-od-border-soft bg-white p-2 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.4)]"
            >
              {menuItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-[14px] font-medium text-od-ink hover:bg-od-canvas/60"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-1 h-px bg-od-border-soft" />
              {secondaryMenuItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-[14px] font-medium text-od-ink-muted hover:bg-od-canvas/60"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative w-full sm:max-w-[420px]">
            <span className="sr-only">Search diagrams, repositories, and READMEs</span>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-od-ink-faint"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search diagrams, repos, READMEs..."
              className="h-11 w-full rounded-full border border-od-border-soft bg-white pl-11 pr-4 text-[14px] text-od-ink outline-none placeholder:text-od-ink-faint focus:border-od-ink"
            />
          </label>

          <button
            type="button"
            onClick={createDiagram}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-od-ink px-6 text-[14px] font-medium text-white transition-colors hover:bg-[#2a2a2a] active:translate-y-px"
          >
            New diagram
            <ArrowIcon />
          </button>
        </section>

        <section className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-medium text-od-ink-faint">Filter</span>
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
              className="h-9 rounded-full border border-od-border-soft bg-white px-4 text-[13px] font-medium text-od-ink-muted transition-colors aria-pressed:border-od-ink aria-pressed:bg-od-ink aria-pressed:text-white"
            >
              {filter}
            </button>
          ))}
        </section>

        <div className="mt-5 h-px w-full bg-od-border-soft" />

        <section className="flex flex-col items-center justify-center py-14 text-center md:py-20">
          <p className="font-serif text-[24px] italic leading-none text-od-ink-faint">
            Nothing here yet
          </p>
          <h1 className="mt-3 max-w-[22ch] text-[26px] font-bold leading-[1.2] -tracking-[0.03em] text-od-ink md:text-[30px]">
            Turn your first repository into a diagram
          </h1>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-[1.7] text-od-ink-muted">
            Connect a repo and OpenDiagram maps its services, APIs, and modules into an editable
            architecture diagram you can refine.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/import/github"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-od-ink px-6 text-[14px] font-medium text-white transition-colors hover:bg-[#2a2a2a] active:translate-y-px"
            >
              Connect a repository
              <ArrowIcon />
            </Link>
            <button
              type="button"
              onClick={createDiagram}
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[14px] font-medium text-od-ink transition-colors hover:bg-white active:translate-y-px"
            >
              Import a diagram
            </button>
          </div>
        </section>

        <footer className="pb-10" />
      </div>
    </main>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
