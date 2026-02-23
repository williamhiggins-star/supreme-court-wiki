/**
 * Data access helpers — reads from the /data directory at build/request time.
 * In production you'd replace these with a database, but JSON files let you
 * get started immediately and version-control the content.
 */

import * as fs from "fs";
import * as path from "path";
import type { CaseSummary, LegalTerm, PrecedentCase } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function listJsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export function getAllCases(): CaseSummary[] {
  const slugs = listJsonFiles(path.join(DATA_DIR, "cases"));
  return slugs
    .map((slug) =>
      readJson<CaseSummary>(path.join(DATA_DIR, "cases", `${slug}.json`))
    )
    .filter((c): c is CaseSummary => c !== null)
    .sort((a, b) => b.argumentDate.localeCompare(a.argumentDate));
}

export function getCaseBySlug(slug: string): CaseSummary | null {
  return readJson<CaseSummary>(path.join(DATA_DIR, "cases", `${slug}.json`));
}

// ---------------------------------------------------------------------------
// Legal Terms
// ---------------------------------------------------------------------------

export function getAllTerms(): LegalTerm[] {
  const slugs = listJsonFiles(path.join(DATA_DIR, "terms"));
  return slugs
    .map((slug) =>
      readJson<LegalTerm>(path.join(DATA_DIR, "terms", `${slug}.json`))
    )
    .filter((t): t is LegalTerm => t !== null)
    .sort((a, b) => a.term.localeCompare(b.term));
}

export function getTermBySlug(slug: string): LegalTerm | null {
  return readJson<LegalTerm>(path.join(DATA_DIR, "terms", `${slug}.json`));
}

// ---------------------------------------------------------------------------
// Precedent Cases
// ---------------------------------------------------------------------------

export function getAllPrecedents(): PrecedentCase[] {
  const slugs = listJsonFiles(path.join(DATA_DIR, "precedents"));
  return slugs
    .map((slug) =>
      readJson<PrecedentCase>(path.join(DATA_DIR, "precedents", `${slug}.json`))
    )
    .filter((p): p is PrecedentCase => p !== null)
    .sort((a, b) => b.year - a.year);
}

export function getPrecedentBySlug(slug: string): PrecedentCase | null {
  return readJson<PrecedentCase>(
    path.join(DATA_DIR, "precedents", `${slug}.json`)
  );
}
