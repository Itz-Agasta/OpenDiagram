"use client";

import { useState } from "react";

const navItems = ["How it Works", "About", "FAQ", "Import your Project"];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex w-full flex-col px-[120px] max-md:px-6">
      <div className="relative z-20 mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between">
        <a
          href="/"
          className="inline-flex h-11 items-center justify-center overflow-hidden rounded-[22px] bg-white px-6 text-base font-bold"
        >
          OpenDiagram
        </a>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-3xl bg-white/50 transition-colors hover:bg-white"
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

      {open && (
        <div className="absolute right-20 top-full z-50 mt-3 w-[20vw] min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="rounded-md border bg-white p-2 shadow-lg">
            {navItems.map((item) => (
              <a
                key={item}
                href="#"
                className="block rounded-md px-4 py-3 text-sm font-instrument-serif transition-colors hover:bg-neutral-100"
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
