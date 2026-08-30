/**
 * justice-stats.ts — per-justice oral-argument stats (speaking time,
 * turns/questions, opinion counts), sourced from public.justice_stats
 * (supabase/migrations/20260828140000_stats_tables.sql).
 *
 * Returns the SAME JusticeStat shape src/lib/justices.ts's
 * getJusticesData() already produces from data/justices.json -- a
 * drop-in replacement wired into JusticesSection.tsx (the existing
 * "Speaking Time & Turns" / opinions-bar-chart panel), not a new UI.
 */

import { db } from "./client";
import { JUSTICE_KEY_BY_PERSON_SLUG, currentTermYear } from "./constants";
import type { JusticeStat } from "@/lib/justices";

// Matches SectionPanels.tsx's ALL_JUSTICES / data/justices.json's
// key/photo pairing exactly -- not derivable from the DB (display name
// and photo path are presentation metadata, not stored anywhere in
// Supabase).
const JUSTICE_DISPLAY: Record<string, { displayName: string; photo: string }> = {
  roberts: { displayName: "Chief Justice Roberts", photo: "/images/justices/roberts.jpg" },
  thomas: { displayName: "Justice Thomas", photo: "/images/justices/thomas.jpg" },
  alito: { displayName: "Justice Alito", photo: "/images/justices/alito.jpg" },
  sotomayor: { displayName: "Justice Sotomayor", photo: "/images/justices/sotomayor.jpg" },
  kagan: { displayName: "Justice Kagan", photo: "/images/justices/kagan.jpg" },
  gorsuch: { displayName: "Justice Gorsuch", photo: "/images/justices/gorsuch.jpg" },
  kavanaugh: { displayName: "Justice Kavanaugh", photo: "/images/justices/kavanaugh.jpg" },
  barrett: { displayName: "Justice Barrett", photo: "/images/justices/barrett.jpg" },
  jackson: { displayName: "Justice Jackson", photo: "/images/justices/jackson.jpg" },
};

export async function getJusticeStatsFromDb(term: string = currentTermYear()): Promise<JusticeStat[]> {
  const { data, error } = await db
    .from("justice_stats")
    .select(
      "questions, total_words, estimated_minutes, cases_participated, majority_opinions, concurrences, dissents, people ( slug )",
    )
    .eq("term", term);
  if (error) throw new Error(`getJusticeStatsFromDb: ${error.message}`);

  return (data ?? [])
    .map((row): JusticeStat | null => {
      const key = JUSTICE_KEY_BY_PERSON_SLUG[row.people?.slug ?? ""];
      const display = key ? JUSTICE_DISPLAY[key] : undefined;
      if (!key || !display) return null;
      return {
        key,
        displayName: display.displayName,
        photo: display.photo,
        questions: row.questions,
        totalWords: row.total_words,
        estimatedMinutes: Number(row.estimated_minutes),
        casesParticipated: row.cases_participated,
        majorityOpinions: row.majority_opinions,
        concurrences: row.concurrences,
        dissents: row.dissents,
      };
    })
    .filter((s): s is JusticeStat => s !== null);
}
