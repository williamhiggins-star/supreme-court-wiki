"use client";

import { SECTIONS, type SectionKey } from "@/lib/dashboard2-sections";

// Desktop: the full row of section links, unchanged. Mobile: a single
// native <select> instead -- SECTIONS unfiltered here (About included,
// since mobile has no separate About button next to the title the way
// desktop's DashboardTitleBar does) so the dropdown alone covers every
// destination the desktop title bar + this nav together provide.
export function BottomTabBar({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <>
      <nav className="hidden flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-5 md:flex">
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
      <select
        value={active}
        onChange={(e) => onSelect(e.target.value as SectionKey)}
        aria-label="Section"
        className="block w-full max-w-[280px] border border-[var(--tan)] bg-[var(--ivory)] px-3 py-2 text-center font-serif text-[14px] uppercase tracking-[0.04em] text-[#1A1A1A] md:hidden"
      >
        {SECTIONS.map(({ key, label }) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </>
  );
}
