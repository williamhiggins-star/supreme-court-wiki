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
import { CONCURRENCE_KINDS, DISSENT_KINDS } from "./cases";
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

interface OpinionCounts {
  majorityOpinions: number;
  concurrences: number;
  dissents: number;
}

// majorityOpinions/concurrences/dissents come straight from opinions/cases
// (the same live tables cases.ts's per-case authorship and the All Cases
// filter both read), not the precomputed justice_stats columns of the same
// name -- those are written by a script that counts data/cases/*.json
// files, which have fallen behind what's actually in the DB (confirmed:
// cases exist in Supabase with no matching JSON file), so they can
// silently undercount a justice by however many of their opinions belong
// to those missing cases.
async function getOpinionCountsByJustice(term: string): Promise<Record<string, OpinionCounts>> {
  const { data, error } = await db
    .from("opinions")
    .select("kind, cases!inner ( term, status ), people!opinions_author_id_fkey ( slug )")
    .eq("cases.term", term)
    .eq("cases.status", "decided");
  if (error) throw new Error(`getOpinionCountsByJustice: ${error.message}`);

  const counts: Record<string, OpinionCounts> = {};
  for (const o of data ?? []) {
    const key = JUSTICE_KEY_BY_PERSON_SLUG[o.people?.slug ?? ""];
    if (!key) continue;
    const entry = (counts[key] ??= { majorityOpinions: 0, concurrences: 0, dissents: 0 });
    if (o.kind === "majority") entry.majorityOpinions++;
    else if (CONCURRENCE_KINDS.has(o.kind)) entry.concurrences++;
    else if (DISSENT_KINDS.has(o.kind)) entry.dissents++;
  }
  return counts;
}

export async function getJusticeStatsFromDb(term: string = currentTermYear()): Promise<JusticeStat[]> {
  const { data, error } = await db
    .from("justice_stats")
    .select("questions, total_words, estimated_minutes, cases_participated, people ( slug )")
    .eq("term", term);
  if (error) throw new Error(`getJusticeStatsFromDb: ${error.message}`);

  const opinionCounts = await getOpinionCountsByJustice(term);

  return (data ?? [])
    .map((row): JusticeStat | null => {
      const key = JUSTICE_KEY_BY_PERSON_SLUG[row.people?.slug ?? ""];
      const display = key ? JUSTICE_DISPLAY[key] : undefined;
      if (!key || !display) return null;
      const counts = opinionCounts[key] ?? { majorityOpinions: 0, concurrences: 0, dissents: 0 };
      return {
        key,
        displayName: display.displayName,
        photo: display.photo,
        questions: row.questions,
        totalWords: row.total_words,
        estimatedMinutes: Number(row.estimated_minutes),
        casesParticipated: row.cases_participated,
        majorityOpinions: counts.majorityOpinions,
        concurrences: counts.concurrences,
        dissents: counts.dissents,
      };
    })
    .filter((s): s is JusticeStat => s !== null);
}
