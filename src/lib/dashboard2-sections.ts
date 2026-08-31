export type SectionKey =
  | "about"
  | "docket"
  | "court-calendar"
  | "circuit-splits"
  | "justices"
  | "justice-profiles"
  | "opinions"
  | "appellate-impacts"
  | "analysis";

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "about", label: "About" },
  { key: "docket", label: "The Docket" },
  { key: "court-calendar", label: "Court Calendar" },
  // "circuit-splits" temporarily hidden from the menu — not removed, just not shown.
  // "justices" (Oral Arguments) temporarily hidden from the menu — not removed, just not shown.
  // "justice-profiles" (Justices) temporarily hidden from the menu — not removed, just not shown.
  { key: "opinions", label: "Opinions" },
  // "appellate-impacts" temporarily hidden from the menu — not removed, just not shown.
  { key: "analysis", label: "Third Party Analysis" },
];

export const DEFAULT_SECTION: SectionKey = "about";
