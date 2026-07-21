"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const navItems = [
  { label: "Features", href: "/features" },
  { label: "About", href: "/about" },
  { label: "GitHub", href: "https://github.com/Itz-Agasta/OpenDiagram" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex w-full flex-col px-[120px] max-lg:px-6">
      <div className="relative z-20 mx-auto grid h-20 w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center justify-self-start gap-2 overflow-hidden rounded-[22px] bg-white px-4 text-base font-bold"
        >
          <Image
            src="/new_logo.png"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 object-contain"
          />
          OpenDiagram
        </Link>
        <nav
          aria-label="Primary navigation"
          className="inline-flex items-center gap-1 max-lg:hidden"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm transition-colors hover:text-black/60"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-self-end gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-black/80 max-lg:hidden"
          >
            Create Your Vibe Diagram
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((v) => !v)}
            className="hidden h-12 w-12 items-center justify-center overflow-hidden rounded-3xl bg-white/50 transition-colors hover:bg-white max-lg:inline-flex"
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
          <div className="rounded-md border bg-white p-2 shadow-lg">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-4 py-3 text-sm transition-colors hover:bg-neutral-100"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-md bg-black px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-black/80"
            >
              Create Your Vibe Diagram
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
