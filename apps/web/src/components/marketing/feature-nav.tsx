"use client";

import { useEffect, useState } from "react";

type FeatureNavItem = { id: string; title: string };

export function FeatureNav({ items }: { items: FeatureNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55%", threshold: [0, 0.2, 0.5] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => {
      sections.forEach((section) => observer.unobserve(section));
      observer.disconnect();
    };
  }, [items]);

  return (
    <nav
      aria-label="Feature sections"
      className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:pb-0"
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={isActive ? "location" : undefined}
            className={`flex min-w-[220px] items-center gap-3 rounded-[10px] px-4 py-4 text-sm font-semibold transition-colors lg:min-w-0 ${
              isActive
                ? "bg-[#1a1a1a] text-white"
                : "text-black/58 hover:bg-black/[0.04] hover:text-black"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 shrink-0 border ${
                isActive ? "border-[#ff4a2c] bg-[#ff4a2c]" : "border-black/28"
              }`}
              aria-hidden="true"
            />
            <span>{item.title}</span>
          </a>
        );
      })}
    </nav>
  );
}
