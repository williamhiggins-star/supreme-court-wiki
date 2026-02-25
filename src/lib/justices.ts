import "server-only";
import * as fs from "fs";
import * as path from "path";

export interface JusticeStat {
  key: string;
  displayName: string;
  photo: string;
  questions: number;
  totalWords: number;
  estimatedMinutes: number;
  casesParticipated: number;
}

export interface JusticesData {
  term: string;
  generated: string;
  justices: JusticeStat[];
}

const DATA_DIR = path.join(process.cwd(), "data");

export function getJusticesData(): JusticesData | null {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "justices.json"), "utf-8");
    return JSON.parse(raw) as JusticesData;
  } catch {
    return null;
  }
}
