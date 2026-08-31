import { getAllCases } from "@/lib/data";
import { getDocketStatus, buildDecidedList } from "@/app/page";
import { getCalendarJson, buildCalendarEvents } from "@/lib/calendar";
import { getArticlesData } from "@/lib/articles";
import { getCircuitSplitsData } from "@/lib/circuit-splits";
import { getAllCaseDetails } from "@/lib/db/cases";
import { getJusticeStatsFromDb } from "@/lib/db/justice-stats";
import {
  getOpinionLengthStats,
  getJusticeAgreementGrid,
  getOpinionJoinerHighlights,
  getConcurrenceJoinMatrix,
} from "@/lib/db/term-stats";
import { ScotusDashboard2Client } from "@/components/ScotusDashboard2Client";
import type { CaseSummary, Article } from "@/types";
import type { CircuitSplit } from "@/lib/circuit-splits";

// Same revalidation cadence as the homepage, so "Today"/"Tomorrow" badges
// stay accurate.
export const revalidate = 3600;

export default async function ScotusDashboard2() {
  // Decided OT2025 cases now come from Supabase, not data/cases/*.json --
  // the DB has 66 (backfilled this session, including cases like Zorn v.
  // Linton that never got a JSON file at all); JSON only has ~55. Every
  // other status (upcoming/argued) and every other term still reads JSON
  // as before -- this data layer covers decided OT2025 only.
  const jsonCases = getAllCases();
  const dbDecidedCases = await getAllCaseDetails();
  const dbSlugs = new Set(dbDecidedCases.map((c) => c.slug));
  const cases: CaseSummary[] = [
    ...jsonCases.filter((c) => !(c.termYear === "2025" && getDocketStatus(c) === "decided" && dbSlugs.has(c.slug))),
    ...dbDecidedCases,
  ];

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
  // Argued: most recent first — getAllCases() already returns descending, no change needed.
  const decidedItems = buildDecidedList(decidedCases);

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

  return (
    <ScotusDashboard2Client
      cases={cases}
      upcomingCases={upcomingCases}
      arguedCases={arguedCases}
      decidedItems={decidedItems}
      justices={justices}
      opinionLengthStats={opinionLengthStats}
      justiceAgreementGrid={justiceAgreementGrid}
      opinionJoinerHighlights={opinionJoinerHighlights}
      concurrenceJoinMatrix={concurrenceJoinMatrix}
      calendarEvents={calendarEvents}
      scotusblogArticles={scotusblogArticles}
      otherArticles={otherArticles}
      circuitSplitsBySlug={circuitSplitsBySlug}
      articlesByCaseSlug={articlesByCaseSlug}
      today={today}
      tomorrow={tomorrow}
    />
  );
}
