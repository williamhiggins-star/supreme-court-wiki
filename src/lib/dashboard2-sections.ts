export type SectionKey =
  | "about"
  | "docket"
  | "court-calendar"
  | "circuit-splits"
  | "justices"
  | "opinions"
  | "appellate-impacts"
  | "analysis";

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "about", label: "About" },
  { key: "docket", label: "The Docket" },
  { key: "court-calendar", label: "Court Calendar" },
  // "circuit-splits" temporarily hidden from the menu — not removed, just not shown.
  { key: "justices", label: "Oral Arguments" },
  // "opinions" temporarily hidden from the menu — not removed, just not shown.
  // "appellate-impacts" temporarily hidden from the menu — not removed, just not shown.
  { key: "analysis", label: "Third Party Analysis" },
];

export const DEFAULT_SECTION: SectionKey = "about";
