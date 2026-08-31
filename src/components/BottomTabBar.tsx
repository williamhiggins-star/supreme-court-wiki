"use client";

import { SECTIONS, type SectionKey } from "@/lib/dashboard2-sections";

// Desktop: the full row of section links, unchanged. Mobile: a single
// native <select> instead -- SECTIONS unfiltered here (About included,
// since mobile has no separate About button next to the title the way
// desktop's DashboardTitleBar does) so the dropdown alone covers every
// destination the desktop title bar + this nav together provide.
//
// `sections` defaults to the real list; pass [] (e.g. the landing page)
// to keep the bar's exact shape/footprint as a space holder with nothing
// in it yet, rather than dropping it and losing the layout space it held.
//
// `hideMobileSelect` drops just the mobile <select> (desktop's <nav> is
// unaffected) -- for a page like the landing page that wants the mobile
// space in its own way (an "Enter" button) instead of an empty dropdown.
export function BottomTabBar({
  active,
  onSelect,
  sections = SECTIONS,
  hideMobileSelect = false,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
  sections?: { key: SectionKey; label: string }[];
  hideMobileSelect?: boolean;
}) {
  // Splitting on "all-cases" and laying the row out as 1fr / auto / 1fr
  // puts it at true page-center (lined up under About) regardless of how
  // much text flanks it on either side -- a plain centered flex row would
  // only land the middle ITEM there if both sides happened to add up to
  // the same width, which "The Docket"/"Court Calendar" vs. "Opinions
  // Data"/"Third Party Analysis" don't.
  const shown = sections.filter(({ key }) => key !== "about");
  const centerIdx = shown.findIndex(({ key }) => key === "all-cases");
  const before = centerIdx === -1 ? shown : shown.slice(0, centerIdx);
  const center = centerIdx === -1 ? null : shown[centerIdx];
  const after = centerIdx === -1 ? [] : shown.slice(centerIdx + 1);

  function renderButton({ key, label }: { key: SectionKey; label: string }) {
    return (
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
    );
  }

  return (
    <>
      <nav className="hidden grid-cols-[1fr_auto_1fr] items-center gap-x-8 px-6 py-5 md:grid">
        <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-3">{before.map(renderButton)}</div>
        <div className="flex items-center justify-center">{center && renderButton(center)}</div>
        <div className="flex flex-wrap items-center justify-start gap-x-8 gap-y-3">{after.map(renderButton)}</div>
      </nav>
      {!hideMobileSelect && (
        <select
          value={active}
          onChange={(e) => onSelect(e.target.value as SectionKey)}
          aria-label="Section"
          className="block w-full max-w-[280px] border border-[var(--tan)] bg-[var(--ivory)] px-3 py-2 text-center font-serif text-[14px] uppercase tracking-[0.04em] text-[#1A1A1A] md:hidden"
        >
          {sections.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
