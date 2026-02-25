import "server-only";
import * as fs from "fs";
import * as path from "path";

export interface AppellateImpact {
  id: string;
  caseName: string;
  docketNumber: string;
  court: string;
  courtKey: string;
  date: string;
  area: string;
  legalQuestion: string;
  description: string;
  positiveImplications: string;
  negativeImplications: string;
  url: string;
  lastUpdated: string;
}

export interface AppellateImpactsData {
  generated: string;
  impacts: AppellateImpact[];
}

const DATA_DIR = path.join(process.cwd(), "data");

export function getAppellateImpactsData(): AppellateImpactsData | null {
  try {
    const raw = fs.readFileSync(
      path.join(DATA_DIR, "appellate-impacts.json"),
      "utf-8",
    );
    return JSON.parse(raw) as AppellateImpactsData;
  } catch {
    return null;
  }
}
