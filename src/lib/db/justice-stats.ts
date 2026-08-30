/**
 * justice-stats.ts — per-justice oral-argument stats (speaking time,
 * turns/questions, opinion counts), sourced from public.justice_stats
 * (supabase/migrations/20260828140000_stats_tables.sql). Backs the
 * planned "Speaking Time & Turns" / "Opinions" panels.
 */

import { db } from "./client";
import { JUSTICE_KEY_BY_PERSON_SLUG } from "./constants";

export interface JusticeStat {
  justiceKey: string;
  personSlug: string;
  questions: number;
  totalWords: number;
  estimatedMinutes: number;
  casesParticipated: number;
  majorityOpinions: number;
  concurrences: number;
  dissents: number;
}

export async function getJusticeStats(term = "2025"): Promise<JusticeStat[]> {
  const { data, error } = await db
    .from("justice_stats")
    .select("person_id, questions, total_words, estimated_minutes, cases_participated, majority_opinions, concurrences, dissents, people ( slug )")
    .eq("term", term);
  if (error) throw new Error(`getJusticeStats: ${error.message}`);

  return (data ?? [])
    .map((row) => {
      const personSlug = row.people?.slug ?? "";
      const justiceKey = JUSTICE_KEY_BY_PERSON_SLUG[personSlug];
      if (!justiceKey) return null;
      return {
        justiceKey,
        personSlug,
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
