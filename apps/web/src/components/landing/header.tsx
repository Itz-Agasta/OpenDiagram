"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { assetUrl } from "@/lib/site";

const navItems = [
  { label: "Features", href: "/features" },
  { label: "About", href: "/about" },
  { label: "GitHub", href: "https://github.com/Itz-Agasta/OpenDiagram" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-black/10 bg-[#d9d9d9]/90 px-[120px] backdrop-blur-xl max-lg:px-6">
      <div className="relative z-20 mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          aria-label="OpenDiagram home"
          className="group inline-flex h-11 items-center justify-center justify-self-start gap-2.5 rounded-full bg-white py-2 pl-2 pr-4 text-[15px] font-semibold ring-1 ring-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2f2f2] transition-transform duration-200 ease-out group-hover:-rotate-6 group-hover:scale-105 motion-reduce:transform-none">
            <Image
              src={assetUrl("/brand/mascot.png")}
              alt=""
              width={32}
              height={32}
              priority
              className="h-7 w-7 object-contain"
            />
          </span>
          OpenDiagram
        </Link>
        <nav
          aria-label="Primary navigation"
          className="inline-flex h-11 items-center gap-1 rounded-full bg-white/55 p-1 ring-1 ring-black/5 max-lg:hidden"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-black/65 hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-black"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-self-end gap-3">
          <Link
            href="/dashboard"
            prefetch={false}
            className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#1a1a1a] px-5 text-sm font-medium text-white hover:bg-[#303030] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black max-lg:hidden"
          >
            Try for Free
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none"
              fill="none"
            >
              <path
                d="M3.5 8h9m-3.25-3.25L12.5 8l-3.25 3.25"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
            </svg>
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((v) => !v)}
            className="hidden h-11 w-11 items-center justify-center rounded-full bg-white/55 ring-1 ring-black/5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black max-lg:inline-flex"
          >
            <span className="relative flex h-5 w-5 items-center justify-center">
              <span
                className={`absolute h-px w-5 bg-black transition-transform duration-300 ${
                  open ? "rotate-45" : "-translate-y-1.5"
                }`}
              />
              <span
                className={`absolute h-px w-5 bg-black transition-transform duration-300 ${
                  open ? "-rotate-45" : "translate-y-1.5"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-navigation"
          className="absolute right-6 top-full z-50 mt-3 hidden w-[min(320px,calc(100vw-3rem))] animate-in fade-in slide-in-from-top-2 duration-200 max-lg:block"
        >
          <div className="rounded-2xl bg-white p-2 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)] ring-1 ring-black/10">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-xl px-4 py-2.5 text-sm font-medium text-black/70 hover:bg-neutral-100 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="mt-1 flex min-h-11 items-center justify-center rounded-xl bg-[#1a1a1a] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#303030] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              Try for Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
