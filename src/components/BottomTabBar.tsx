"use client";

import { SECTIONS, type SectionKey } from "@/lib/dashboard2-sections";

export function BottomTabBar({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-5">
      {SECTIONS.filter(({ key }) => key !== "about").map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`px-2 py-1 font-serif text-[15px] uppercase tracking-[0.04em] text-[#1A1A1A] ${
            active === key ? "font-bold" : "font-normal"
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
