// Pure constants and helpers — safe to import in both server and client code.
// Server-only map computation lives in circuits-server.ts.

import type { CaseSummary } from "@/types";

// ── Circuit metadata ─────────────────────────────────────────────────────────

export const CIRCUIT_NAMES: Record<number, string> = {
  1: "1st Circuit",
  2: "2nd Circuit",
  3: "3rd Circuit",
  4: "4th Circuit",
  5: "5th Circuit",
  6: "6th Circuit",
  7: "7th Circuit",
  8: "8th Circuit",
  9: "9th Circuit",
  10: "10th Circuit",
  11: "11th Circuit",
  12: "D.C. Circuit",
  13: "Federal Circuit",
};

// Subtle fill colors per circuit
export const CIRCUIT_COLORS: Record<number, string> = {
  1:  "#dbeafe",
  2:  "#dcfce7",
  3:  "#fef9c3",
  4:  "#ffe4e6",
  5:  "#fef3c7",
  6:  "#e0e7ff",
  7:  "#d1fae5",
  8:  "#fce7f3",
  9:  "#f3e8ff",
  10: "#ccfbf1",
  11: "#ffedd5",
  12: "#f1f5f9",
  13: "#ecfdf5",
};

// Darker accent per circuit
export const CIRCUIT_DARK: Record<number, string> = {
  1:  "#2563eb",
  2:  "#16a34a",
  3:  "#ca8a04",
  4:  "#e11d48",
  5:  "#d97706",
  6:  "#4338ca",
  7:  "#059669",
  8:  "#db2777",
  9:  "#7c3aed",
  10: "#0d9488",
  11: "#ea580c",
  12: "#475569",
  13: "#065f46",
};

// ── State FIPS → circuit ─────────────────────────────────────────────────────

export const FIPS_TO_CIRCUIT: Record<string, number> = {
  // 1st Circuit
  "23": 1, "33": 1, "25": 1, "44": 1,
  // 2nd Circuit
  "09": 2, "36": 2, "50": 2,
  // 3rd Circuit
  "10": 3, "34": 3, "42": 3,
  // 4th Circuit
  "24": 4, "37": 4, "45": 4, "51": 4, "54": 4,
  // 5th Circuit
  "22": 5, "28": 5, "48": 5,
  // 6th Circuit
  "21": 6, "26": 6, "39": 6, "47": 6,
  // 7th Circuit
  "17": 7, "18": 7, "55": 7,
  // 8th Circuit
  "05": 8, "19": 8, "27": 8, "29": 8, "31": 8, "38": 8, "46": 8,
  // 9th Circuit
  "02": 9, "04": 9, "06": 9, "15": 9, "16": 9, "30": 9, "32": 9, "41": 9, "53": 9,
  // 10th Circuit
  "08": 10, "20": 10, "35": 10, "40": 10, "49": 10, "56": 10,
  // 11th Circuit
  "01": 11, "12": 11, "13": 11,
  // D.C. Circuit
  "11": 12,
};

export const FIPS_TO_ABBR: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
  "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
  "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
  "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
  "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
  "54":"WV","55":"WI","56":"WY",
};

// ── Circuit extraction from case text ────────────────────────────────────────

const CIRCUIT_PATTERNS: [RegExp, number][] = [
  [/\bfirst\s+circuit\b/i, 1],
  [/\bsecond\s+circuit\b/i, 2],
  [/\bthird\s+circuit\b/i, 3],
  [/\bfourth\s+circuit\b/i, 4],
  [/\bfifth\s+circuit\b/i, 5],
  [/\bsixth\s+circuit\b/i, 6],
  [/\bseventh\s+circuit\b/i, 7],
  [/\beighth\s+circuit\b/i, 8],
  [/\bninth\s+circuit\b/i, 9],
  [/\btenth\s+circuit\b/i, 10],
  [/\beleventh\s+circuit\b/i, 11],
  [/\bD\.C\.\s+circuit\b/i, 12],
  [/\bDistrict\s+of\s+Columbia\s+circuit\b/i, 12],
  [/\bfederal\s+circuit\b/i, 13],
];

/** Lightweight split summary passed into CircuitMap (no server-only types). */
export interface CircuitSplitSummary {
  splitId: string;
  legalQuestion: string;
  area: string;
  /** This specific circuit's position label, e.g. "Yes" or "Does Not Apply" */
  positionLabel: string;
  status: "open" | "scotus_pending" | "scotus_resolved";
  relatedScotusSlug?: string | null;
}

/** Convert a CourtListener circuit key ("ca5", "cadc") to our numeric ID. */
export function circuitKeyToNumber(key: string): number | null {
  if (key === "cadc")  return 12;
  if (key === "cafc")  return 13;
  const m = key.match(/^ca(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function extractCircuit(text: string): number | null {
  for (const [re, circuit] of CIRCUIT_PATTERNS) {
    if (re.test(text)) return circuit;
  }
  return null;
}

// ── Shared types ─────────────────────────────────────────────────────────────

export interface StateFeature {
  id: string;
  abbr: string;
  circuit: number;
  pathD: string;
  centroidX: number;
  centroidY: number;
}

export interface CircuitMapData {
  states: StateFeature[];
  circuitBorderPath: string;
  outerBorderPath: string;
  viewBox: string;
}

export interface CircuitCase {
  slug: string;
  title: string;
  caseNumber: string;
  status: "upcoming" | "argued";
}

// ── Case grouping (shared, no Node.js deps) ──────────────────────────────────

export function groupCasesByCircuit(
  cases: CaseSummary[],
  today: string
): Record<number, CircuitCase[]> {
  const result: Record<number, CircuitCase[]> = {};

  for (const c of cases) {
    if (c.docketStatus === "decided" || c.outcome) continue;
    const isUpcoming = c.argumentDate >= today;
    if (c.docketStatus === "upcoming" && !isUpcoming) continue;

    const circuit = extractCircuit(
      (c.backgroundAndFacts ?? "") + " " + (c.significance ?? "")
    );
    if (!circuit) continue;

    const status: "upcoming" | "argued" = isUpcoming ? "upcoming" : "argued";
    if (!result[circuit]) result[circuit] = [];
    result[circuit].push({
      slug: c.slug,
      title: c.title,
      caseNumber: c.caseNumber,
      status,
    });
  }

  return result;
}

// Circuit centroid overrides (AlbersUSA 975×610 viewport).
// Computed via topojson.merge per circuit + pathFn.centroid on the combined geometry,
// using the same projection (geoAlbersUsa scale 1300, translate [487.5, 305]).
// Circuit 9 excludes AK (02) and HI (15) so the badge stays over the continental west.
const CIRCUIT_CENTROID_OVERRIDES: Record<number, [number, number]> = {
  1:  [911, 116],
  2:  [844, 168],
  3:  [815, 228],
  4:  [794, 331],
  5:  [477, 466],
  6:  [715, 266],
  7:  [620, 231],
  8:  [493, 216],
  9:  [166, 207],
  10: [343, 306],
  11: [727, 460],
  12: [828, 267],
};

export function getCircuitCentroids(
  states: StateFeature[]
): Record<number, [number, number]> {
  const sums: Record<number, [number, number, number]> = {};
  for (const s of states) {
    const c = s.circuit;
    if (!sums[c]) sums[c] = [0, 0, 0];
    sums[c][0] += s.centroidX;
    sums[c][1] += s.centroidY;
    sums[c][2] += 1;
  }
  const result: Record<number, [number, number]> = {};
  for (const [cStr, [sumX, sumY, n]] of Object.entries(sums)) {
    const c = Number(cStr);
    result[c] = CIRCUIT_CENTROID_OVERRIDES[c] ?? [sumX / n, sumY / n];
  }
  return result;
}
