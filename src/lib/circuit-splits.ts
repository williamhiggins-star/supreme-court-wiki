import "server-only";
import * as fs from "fs";
import * as path from "path";
import type {
  CircuitCaseRef,
  CircuitPosition,
  CircuitSplit,
  CircuitSplitsData,
} from "@/types";

export type {
  CircuitCaseRef,
  CircuitPosition,
  CircuitSplit,
  CircuitSplitsData,
};

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

export function getCircuitSplitForCase(slug: string): CircuitSplit | null {
  const data = getCircuitSplitsData();
  if (!data) return null;
  return data.splits.find((s) => s.relatedScotusSlug === slug) ?? null;
}
