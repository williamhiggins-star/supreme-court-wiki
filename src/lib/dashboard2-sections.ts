export type SectionKey =
  | "about"
  | "docket"
  | "justices"
  | "counsel"
  | "circuit-map"
  | "court-calendar"
  | "circuit-splits"
  | "appellate-impacts"
  | "analysis";

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "about", label: "About" },
  { key: "docket", label: "The Docket" },
  { key: "justices", label: "Justices" },
  { key: "counsel", label: "Counsel" },
  { key: "circuit-map", label: "Circuit Map" },
  { key: "court-calendar", label: "Court Calendar" },
  { key: "circuit-splits", label: "Circuit Splits" },
  { key: "appellate-impacts", label: "Appellate Impacts" },
  { key: "analysis", label: "Analysis" },
];

export const DEFAULT_SECTION: SectionKey = "about";
