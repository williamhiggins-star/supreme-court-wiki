import * as fs from "fs";
import * as path from "path";
import type { CaseSummary } from "@/types";

export interface CalendarEventCase {
  title: string;
  slug: string;
  caseNumber: string;
}

export interface CalendarEvent {
  date: string; // "YYYY-MM-DD"
  type: "argument" | "conference";
  cases?: CalendarEventCase[]; // only for type === "argument"
}

interface CalendarJson {
  term: string;
  generated: string;
  conferences: string[];
}

export function getCalendarJson(): CalendarJson | null {
  try {
    const fp = path.join(process.cwd(), "data", "calendar.json");
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as CalendarJson;
  } catch {
    return null;
  }
}

export function buildCalendarEvents(
  cases: CaseSummary[],
  calendarJson: CalendarJson | null
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Group cases by argument date
  const byDate = new Map<string, CalendarEventCase[]>();
  for (const c of cases) {
    if (!c.argumentDate) continue;
    if (!byDate.has(c.argumentDate)) byDate.set(c.argumentDate, []);
    byDate.get(c.argumentDate)!.push({
      title: c.title,
      slug: c.slug,
      caseNumber: c.caseNumber,
    });
  }
  for (const [date, casesOnDate] of byDate) {
    events.push({ date, type: "argument", cases: casesOnDate });
  }

  // Add conference dates
  for (const date of calendarJson?.conferences ?? []) {
    events.push({ date, type: "conference" });
  }

  return events;
}
