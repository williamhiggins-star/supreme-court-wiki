import { getDocketStatus, buildDecidedList, type DecidedItem } from "@/app/page";
import { getCalendarJson, buildCalendarEvents, type CalendarEvent } from "@/lib/calendar";
import { getArticlesData } from "@/lib/articles";
import { getCircuitSplitsData, type CircuitSplit } from "@/lib/circuit-splits";
import { getAllCasesForTerm, getIssueCategories, type IssueCategoryRef } from "@/lib/db/cases";
import { getJusticeStatsFromDb } from "@/lib/db/justice-stats";
import {
  getOpinionLengthStats,
  getJusticeAgreementGrid,
  getOpinionJoinerHighlights,
  getConcurrenceJoinMatrix,
  getDissentJoinMatrix,
  getTotalWordsByJustice,
  getMajorityMinorityRateByJustice,
  type OpinionLengthStats,
  type JusticeAgreementPair,
  type OpinionJoinerHighlights,
  type JusticeJoinData,
  type JusticeMajorityMinorityRate,
} from "@/lib/db/term-stats";
import type { CaseSummary, Article } from "@/types";
import type { JusticeStat } from "@/lib/justices";

export interface ScotusDashboard2Data {
  cases: CaseSummary[];
  upcomingCases: CaseSummary[];
  arguedCases: CaseSummary[];
  decidedItems: DecidedItem[];
  issueCategories: IssueCategoryRef[];
  justices: JusticeStat[];
  opinionLengthStats: OpinionLengthStats;
  justiceAgreementGrid: JusticeAgreementPair[];
  opinionJoinerHighlights: OpinionJoinerHighlights;
  concurrenceJoinMatrix: JusticeJoinData;
  dissentJoinMatrix: JusticeJoinData;
  totalWordsByJustice: Record<string, number>;
  majorityMinorityRateByJustice: Record<string, JusticeMajorityMinorityRate>;
  calendarEvents: CalendarEvent[];
  scotusblogArticles: Article[];
  otherArticles: Article[];
  circuitSplitsBySlug: Record<string, CircuitSplit>;
  articlesByCaseSlug: Record<string, Article[]>;
  today: string;
  tomorrow: string;
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
  // Docket data is DB-only, scoped to term 2025 -- no more JSON fallback
  // for upcoming/argued, and no more merge/dedup logic. Companion-docket
  // cases (e.g. Little v. Hecox, consolidated into West Virginia v.
  // B.P.J.) are excluded by getAllCasesForTerm itself.
  const cases: CaseSummary[] = await getAllCasesForTerm("2025");

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

  // All Cases, "Issue" filter's dropdown options (Feldman's Stat Pack
  // classification, backfilled for OT2025 decided cases).
  const issueCategories = await getIssueCategories();

  // Speaking time/turns/opinions panel (JusticesSection.tsx) -- now DB-
  // sourced (justice_stats table) instead of data/justices.json. Same
  // JusticeStat shape, so JusticesSection needs no changes.
  const justices = await getJusticeStatsFromDb();

  // Opinions section, "Length" menu item.
  const opinionLengthStats = await getOpinionLengthStats();

  // Opinions section, "Alignment" menu item.
  const justiceAgreementGrid = await getJusticeAgreementGrid();

  // Opinions section, "Volume" > "Highlights" menu item.
  const opinionJoinerHighlights = await getOpinionJoinerHighlights();

  // Opinions section, "Alignment" > "Joiners" menu item.
  const concurrenceJoinMatrix = await getConcurrenceJoinMatrix();
  const dissentJoinMatrix = await getDissentJoinMatrix();

  // Opinions section, "Justices" menu item.
  const totalWordsByJustice = await getTotalWordsByJustice();
  const majorityMinorityRateByJustice = await getMajorityMinorityRateByJustice();

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
    issueCategories,
    justices,
    opinionLengthStats,
    justiceAgreementGrid,
    opinionJoinerHighlights,
    concurrenceJoinMatrix,
    dissentJoinMatrix,
    totalWordsByJustice,
    majorityMinorityRateByJustice,
    calendarEvents,
    scotusblogArticles,
    otherArticles,
    circuitSplitsBySlug,
    articlesByCaseSlug,
    today,
    tomorrow,
  };
}
