import "server-only";
import * as fs from "fs";
import * as path from "path";

export interface CircuitCaseRef {
  key: string;
  name: string;
  shortName: string;
  caseName: string;
  year: number;
  citation?: string;
  url: string;
}

export interface CircuitPosition {
  label: string;
  summary: string;
  circuits: CircuitCaseRef[];
}

export interface CircuitSplit {
  id: string;
  legalQuestion: string;
  description: string;
  area: string;
  positions: CircuitPosition[];
  status: "open" | "scotus_pending" | "scotus_resolved";
  relatedScotusSlug?: string | null;
  relatedScotusTitle?: string | null;
  lastUpdated: string;
}

export interface CircuitSplitsData {
  generated: string;
  splits: CircuitSplit[];
}

const DATA_DIR = path.join(process.cwd(), "data");

export function getCircuitSplitsData(): CircuitSplitsData | null {
  try {
    const raw = fs.readFileSync(
      path.join(DATA_DIR, "circuit-splits.json"),
      "utf-8",
    );
    return JSON.parse(raw) as CircuitSplitsData;
  } catch {
    return null;
  }
}
