"use client";

import type { SectionKey } from "@/lib/dashboard2-sections";

export function DashboardTitleBar({
  active,
  onSelect,
  label = "About",
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
  label?: string;
}) {
  return (
    // Mobile: hidden here entirely -- "SCOTUS Dashboard" lives in the
    // always-visible top bar instead (see ScotusDashboard2Client), and
    // "About" folds into BottomTabBar's mobile dropdown, so this whole
    // title+About unit has no separate role to play on mobile.
    <div className="hidden flex-col items-center justify-center gap-1 md:flex">
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
        {label}
      </button>
    </div>
  );
}
