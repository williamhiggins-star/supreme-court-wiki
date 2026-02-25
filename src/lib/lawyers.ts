import "server-only";
import * as fs from "fs";
import * as path from "path";

export interface LawyerCase {
  slug: string;
  caseNumber: string;
  title: string;
}

export interface LawyerStat {
  label: string;
  name: string;
  totalWords: number;
  estimatedMinutes: number;
  casesArgued: number;
  cases: LawyerCase[];
}

export interface LawyersData {
  term: string;
  generated: string;
  lawyers: LawyerStat[];
}

const DATA_DIR = path.join(process.cwd(), "data");

export function getLawyersData(): LawyersData | null {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "lawyers.json"), "utf-8");
    return JSON.parse(raw) as LawyersData;
  } catch {
    return null;
  }
}
