"use client";

import type { SectionKey } from "@/lib/dashboard2-sections";

export function DashboardTitleBar({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <span className="font-serif text-[28px] font-normal italic text-[#1A1A1A]">
        SCOTUS Dashboard
      </span>
      <button
        type="button"
        onClick={() => onSelect("about")}
        className={`px-2 py-1 font-serif text-[15px] uppercase tracking-[0.04em] text-[#1A1A1A] ${
          active === "about" ? "font-bold" : "font-normal"
        }`}
      >
        About
      </button>
    </div>
  );
}
