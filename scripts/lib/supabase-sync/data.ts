/**
 * data.ts — load the committed dashboard JSON that is the source of truth.
 *
 * One-directional flow: dashboard → Supabase. We only ever READ these files.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  CaseSummary,
  CircuitSplit,
  CircuitSplitsData,
  Article,
  ArticlesData,
} from "../../../src/types/index.js";

const DATA_DIR = path.join(process.cwd(), "data");
const CASES_DIR = path.join(DATA_DIR, "cases");

/** An appellate-impact record from data/appellate-impacts.json. */
export interface AppellateImpact {
  id: string;
  caseName: string;
  docketNumber?: string;
  court?: string;
  courtKey?: string;
  date?: string;
  area?: string;
  legalQuestion?: string;
  description?: string;
  positiveImplications?: string;
  negativeImplications?: string;
  url?: string;
  lastUpdated?: string;
}

interface AppellateImpactsData {
  generated: string;
  impacts: AppellateImpact[];
}

export function loadCases(): CaseSummary[] {
  let files: string[];
  try {
    files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: CaseSummary[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), "utf-8")));
    } catch {
      /* skip malformed file */
    }
  }
  return out;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
  } catch {
    return null;
  }
}

export function loadSplits(): CircuitSplit[] {
  return readJson<CircuitSplitsData>("circuit-splits.json")?.splits ?? [];
}

export function loadArticles(): Article[] {
  return readJson<ArticlesData>("articles.json")?.articles ?? [];
}

export function loadAppellateImpacts(): AppellateImpact[] {
  return readJson<AppellateImpactsData>("appellate-impacts.json")?.impacts ?? [];
}
