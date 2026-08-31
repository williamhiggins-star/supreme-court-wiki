import { getDocketStatus, buildDecidedList } from "@/app/page";
import { getCalendarJson, buildCalendarEvents } from "@/lib/calendar";
import { getArticlesData } from "@/lib/articles";
import { getCircuitSplitsData } from "@/lib/circuit-splits";
import { getAllCasesForTerm } from "@/lib/db/cases";
import { getJusticeStatsFromDb } from "@/lib/db/justice-stats";
import {
  getOpinionLengthStats,
  getJusticeAgreementGrid,
  getOpinionJoinerHighlights,
  getConcurrenceJoinMatrix,
  getDissentJoinMatrix,
  getTotalWordsByJustice,
  getMajorityMinorityRateByJustice,
} from "@/lib/db/term-stats";
import { ScotusDashboard2Client } from "@/components/ScotusDashboard2Client";
import type { CaseSummary, Article } from "@/types";
import type { CircuitSplit } from "@/lib/circuit-splits";

// Same revalidation cadence as the homepage, so "Today"/"Tomorrow" badges
// stay accurate.
export const revalidate = 3600;

export default async function ScotusDashboard2({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  // ?case=<slug> deep-links straight into a case's detail view on load --
  // this is the only case-detail URL that resolves DB-only cases (no
  // data/cases/*.json file), which /cases/[slug] can't. See
  // ScotusDashboard2Client's initialCaseSlug prop and /docket/[column]'s
  // case links.
  const { case: initialCaseSlug } = await searchParams;

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

  return (
    <ScotusDashboard2Client
      cases={cases}
      initialCaseSlug={initialCaseSlug ?? null}
      upcomingCases={upcomingCases}
      arguedCases={arguedCases}
      decidedItems={decidedItems}
      justices={justices}
      opinionLengthStats={opinionLengthStats}
      justiceAgreementGrid={justiceAgreementGrid}
      opinionJoinerHighlights={opinionJoinerHighlights}
      concurrenceJoinMatrix={concurrenceJoinMatrix}
      dissentJoinMatrix={dissentJoinMatrix}
      totalWordsByJustice={totalWordsByJustice}
      majorityMinorityRateByJustice={majorityMinorityRateByJustice}
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
