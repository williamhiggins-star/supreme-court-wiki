import { getDocketStatus, buildDecidedList, buildAllCasesList, type DecidedItem } from "@/lib/docket";
import { getCalendarJson, buildCalendarEvents, type CalendarEvent } from "@/lib/calendar";
import { getArticlesData } from "@/lib/articles";
import { getCircuitSplitsData, type CircuitSplit } from "@/lib/circuit-splits";
import { getAllCasesForTerm, getIssueCategories, type IssueCategoryRef } from "@/lib/db/cases";
import { getJusticeStatsFromDb } from "@/lib/db/justice-stats";
import { db } from "@/lib/db/client";
import type {
  OpinionLengthStats,
  JusticeAgreementPair,
  OpinionJoinerHighlights,
  JusticeJoinData,
  JusticeMajorityMinorityRate,
} from "@/lib/db/term-stats";
import type { CaseSummary, Article } from "@/types";
import type { JusticeStat } from "@/lib/justices";

export interface ScotusDashboard2Data {
  cases: CaseSummary[];
  upcomingCases: CaseSummary[];
  arguedCases: CaseSummary[];
  decidedItems: DecidedItem[];
  allCasesItems: DecidedItem[];
  issueCategories: IssueCategoryRef[];
  termOptions: { value: string; label: string }[];
  justices: JusticeStat[];
  opinionStatsByTerm: Record<string, OpinionTermStats>;
  calendarEvents: CalendarEvent[];
  scotusblogArticles: Article[];
  otherArticles: Article[];
  circuitSplitsBySlug: Record<string, CircuitSplit>;
  articlesByCaseSlug: Record<string, Article[]>;
  today: string;
  tomorrow: string;
}

// Opinions Data panel's 8 term-stat metrics, bundled for one term. Sourced
// from public.term_opinion_stats (materialized nightly by
// scripts/compute-opinion-term-stats.ts from term-stats.ts/justice-stats.ts
// -- those 8 functions are unchanged and still individually queryable, just
// no longer called live from this read path) instead of computed per
// render. See the "materializing Opinions Data term stats" investigation
// (2026-09-22).
export interface OpinionTermStats {
  opinionLength: OpinionLengthStats;
  agreementGrid: JusticeAgreementPair[];
  joinerHighlights: OpinionJoinerHighlights;
  concurrenceJoinMatrix: JusticeJoinData;
  dissentJoinMatrix: JusticeJoinData;
  totalWordsByJustice: Record<string, number>;
  majorityMinorityRateByJustice: Record<string, JusticeMajorityMinorityRate>;
  // This term's justice_stats payload -- the SAME JusticeStat[] shape as
  // the top-level `justices` field above, but scoped to whichever term the
  // Opinions Data panel's own toggle has selected. Deliberately NOT the
  // same value as `justices` (which stays live-current-term-only, for the
  // separate "Justices" nav section -- SectionPanels.tsx's
  // JusticesSpeakingPanel/JusticesOpinionsPanel -- untouched by the
  // Opinions Data term toggle).
  justiceStats: JusticeStat[];
  // True once this term has at least one word-counted opinion --
  // averageWordCount is null iff there are none, the same signal
  // getOpinionLengthStats itself produces live for a term with no data.
  // Lets the panel show "No Opinions for Term {term}" instead of a blank
  // or broken-looking view. A genuine fetch error is NOT folded into
  // this -- getOpinionStatsByTerm throws on one, same as every other
  // src/lib/db/* accessor, so a real failure never gets silently
  // displayed as "no opinions yet."
  hasOpinions: boolean;
}

function emptyOpinionLengthStats(): OpinionLengthStats {
  return {
    averageWordCount: null,
    longestOverall: null,
    longestMajority: null,
    longestConcurrence: null,
    longestDissent: null,
    shortestOverall: null,
    shortestMajority: null,
    shortestConcurrence: null,
    longestByJustice: [],
    shortestByJustice: [],
  };
}

function emptyJoinerHighlights(): OpinionJoinerHighlights {
  return {
    mostSoloConcurrences: null,
    mostJoinedConcurrence: null,
    mostSoloDissents: null,
    mostJoinedDissent: null,
    casesByJusticeAndCategory: { total: {}, majority: {}, concurrence: {}, dissent: {} },
    mostJoinedConcurrences: [],
    mostJoinedDissents: [],
  };
}

function emptyJoinData(): JusticeJoinData {
  return { pairs: [], authoredCountBySlug: {} };
}

interface TermOpinionStatsRow {
  term: string;
  metric_type: string;
  payload: unknown;
}

/**
 * Opinions Data panel read path: one query for every tracked term instead
 * of the 8 term-stats.ts/justice-stats.ts functions called live. The
 * panel's own term toggle (SectionPanels.tsx) then just switches which
 * already-fetched slice of the returned map renders -- no further
 * round-trips.
 *
 * A missing row (a brand-new term before the nightly population job has
 * run for it even once) and a row present with an empty/zeroed payload
 * (the job HAS run and found no opinions yet -- OT2026 today) are treated
 * identically: both resolve to the empty defaults above, and hasOpinions
 * comes out false either way.
 */
async function getOpinionStatsByTerm(terms: string[]): Promise<Record<string, OpinionTermStats>> {
  const { data, error } = await db.from("term_opinion_stats").select("*").in("term", terms);
  if (error) throw new Error(`getOpinionStatsByTerm: ${error.message}`);

  const rowsByTerm = new Map<string, Map<string, unknown>>();
  for (const row of (data ?? []) as TermOpinionStatsRow[]) {
    const byMetric = rowsByTerm.get(row.term) ?? new Map<string, unknown>();
    byMetric.set(row.metric_type, row.payload);
    rowsByTerm.set(row.term, byMetric);
  }

  const result: Record<string, OpinionTermStats> = {};
  for (const term of terms) {
    const byMetric = rowsByTerm.get(term);
    const opinionLength = (byMetric?.get("opinion_length") as OpinionLengthStats | undefined) ?? emptyOpinionLengthStats();
    result[term] = {
      opinionLength,
      agreementGrid: (byMetric?.get("agreement_grid") as JusticeAgreementPair[] | undefined) ?? [],
      joinerHighlights: (byMetric?.get("joiner_highlights") as OpinionJoinerHighlights | undefined) ?? emptyJoinerHighlights(),
      concurrenceJoinMatrix: (byMetric?.get("concurrence_join_matrix") as JusticeJoinData | undefined) ?? emptyJoinData(),
      dissentJoinMatrix: (byMetric?.get("dissent_join_matrix") as JusticeJoinData | undefined) ?? emptyJoinData(),
      totalWordsByJustice: (byMetric?.get("total_words_by_justice") as Record<string, number> | undefined) ?? {},
      majorityMinorityRateByJustice:
        (byMetric?.get("majority_minority_rate") as Record<string, JusticeMajorityMinorityRate> | undefined) ?? {},
      justiceStats: (byMetric?.get("justice_stats") as JusticeStat[] | undefined) ?? [],
      hasOpinions: opinionLength.averageWordCount !== null,
    };
  }
  return result;
}

/**
 * Everything ScotusDashboard2Client needs, in one place -- shared by
 * /scotusdashboard2 (the real dashboard) and /scotusdashboard2landing
 * (which renders that same dashboard hidden underneath its carousel, so
 * the "Enter" slide-up reveals an already-rendered page instead of
 * navigating to a cold one). Keeping this in one function means the two
 * routes can't drift apart on what data the dashboard actually needs.
 */
export async function getScotusDashboard2Data(): Promise<ScotusDashboard2Data> {
  // Docket data is DB-only -- no more JSON fallback for upcoming/argued,
  // and no more merge/dedup logic beyond the term merge below.
  // Companion-docket cases (e.g. Little v. Hecox, consolidated into West
  // Virginia v. B.P.J.) are excluded by getAllCasesForTerm itself.
  //
  // The two terms this dashboard tracks -- literal, not derived from
  // currentTermYear(), so it doesn't depend on any fallback logic about
  // which term "has data yet." OT2025 stays on the docket alongside
  // OT2026 starting now, ahead of OT2026's own Oct 1 cutover; bump this
  // by hand each October when a new term starts.
  const TRACKED_TERMS = ["2025", "2026"];
  const casesByTerm = await Promise.all(TRACKED_TERMS.map((t) => getAllCasesForTerm(t)));
  const cases: CaseSummary[] = casesByTerm.flat();
  // Current term first -- the All Cases panel's Term filter defaults to
  // termOptions[0].
  const termOptions = TRACKED_TERMS.map((t) => ({ value: t, label: `Term ${t}` }));

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

  const upcomingCases: CaseSummary[] = [];
  const arguedCases: CaseSummary[] = [];
  const decidedCases: CaseSummary[] = [];
  for (const c of cases) {
    const status = getDocketStatus(c);
    if (status === "upcoming") upcomingCases.push(c);
    else if (status === "argued") arguedCases.push(c);
    else decidedCases.push(c);
  }
  // Soonest first, same as the homepage.
  upcomingCases.sort((a, b) => a.argumentDate.localeCompare(b.argumentDate));
  // Most recently argued first (no longer relying on getAllCases()'s
  // incidental JSON file order now that this is DB-sourced).
  arguedCases.sort((a, b) => b.argumentDate.localeCompare(a.argumentDate));
  const decidedItems = buildDecidedList(decidedCases);
  // All Cases panel: every tracked case regardless of Docket status, not
  // just decided ones (decidedItems above stays decided-only -- that's
  // still what the Docket's own Decided column shows).
  const allCasesItems = buildAllCasesList(cases);

  // All Cases, "Issue" filter's dropdown options (Feldman's Stat Pack
  // classification, backfilled for OT2025 decided cases).
  const issueCategories = await getIssueCategories();

  // Speaking time/turns/opinions panel (JusticesSection.tsx) -- now DB-
  // sourced (justice_stats table) instead of data/justices.json. Same
  // JusticeStat shape, so JusticesSection needs no changes.
  const justices = await getJusticeStatsFromDb();

  // Opinions Data panel -- all 8 term-stat metrics, one query, keyed by
  // term so the panel's own term toggle can switch between already-
  // fetched slices with zero further round-trips (see
  // getOpinionStatsByTerm above).
  const opinionStatsByTerm = await getOpinionStatsByTerm(TRACKED_TERMS);

  const calendarJson = getCalendarJson();
  const calendarEvents = buildCalendarEvents(cases, calendarJson);

  const articlesData = getArticlesData();
  const allArticles = articlesData?.articles ?? [];
  const scotusblogArticles: Article[] = allArticles
    .filter((a) => a.source === "SCOTUSblog")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const otherArticles: Article[] = allArticles
    .filter((a) => a.source !== "SCOTUSblog")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // Which cases have a related circuit split / related articles — used to
  // decide which menu sections apply to a given case in the case-panel view.
  const circuitSplitsData = getCircuitSplitsData();
  const circuitSplitsBySlug: Record<string, CircuitSplit> = {};
  for (const s of circuitSplitsData?.splits ?? []) {
    if (s.relatedScotusSlug) circuitSplitsBySlug[s.relatedScotusSlug] = s;
  }
  const articlesByCaseSlug: Record<string, Article[]> = {};
  for (const a of allArticles) {
    for (const slug of a.relatedCaseSlugs) {
      (articlesByCaseSlug[slug] ??= []).push(a);
    }
  }

  return {
    cases,
    upcomingCases,
    arguedCases,
    decidedItems,
    allCasesItems,
    issueCategories,
    termOptions,
    justices,
    opinionStatsByTerm,
    calendarEvents,
    scotusblogArticles,
    otherArticles,
    circuitSplitsBySlug,
    articlesByCaseSlug,
    today,
    tomorrow,
  };
}
