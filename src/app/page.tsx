import Link from "next/link";
import { getAllCases } from "@/lib/data";
import { getCalendarJson, buildCalendarEvents } from "@/lib/calendar";
import { getCircuitMapData } from "@/lib/circuits-server";
import { groupCasesByCircuit, circuitKeyToNumber } from "@/lib/circuits";
import { getCircuitSplitsData } from "@/lib/circuit-splits";
import { getArticlesData } from "@/lib/articles";
import { getJusticesData } from "@/lib/justices";
import { getLawyersData } from "@/lib/lawyers";
import { CourtCalendar } from "@/components/CourtCalendar";
import { CircuitMap } from "@/components/CircuitMap";
import { SplitCard } from "@/components/CircuitSplitsSection";
import { JusticesSection } from "@/components/JusticesSection";
import { LawyersSection } from "@/components/LawyersSection";
import { NavBar } from "@/components/NavBar";
import type { CaseSummary } from "@/types";

// Revalidate every hour so "Decided Today" / "Today" badges clear within 24 h of the event day.
export const revalidate = 3600;

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getDocketStatus(c: CaseSummary): "upcoming" | "argued" | "decided" {
  if (c.docketStatus === "decided") return "decided";
  if (c.outcome) return "decided";
  if (!c.argumentDate) return "upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = c.argumentDate.split("-").map(Number);
  const argDate = new Date(y, m - 1, d);
  if (argDate > today) return "upcoming";
  return "argued";
}

export type DecidedItem = {
  type: "case";
  slug: string;
  title: string;
  sub: string;
  href: string;
  decisionDate?: string;
  voteSplit?: string;
  podcastEpisodeUrl?: string;
};

export function buildDecidedList(decidedCases: CaseSummary[]): DecidedItem[] {
  const items: DecidedItem[] = decidedCases.map((c) => {
    const dissents = c.dissentAuthors?.length ?? 0;
    const voteSplit = c.majorityAuthor
      ? dissents === 0 ? "Unanimous" : `${9 - dissents}–${dissents}`
      : undefined;
    return {
      type: "case" as const,
      slug: c.slug,
      title: c.title,
      sub: `${c.termYear} Term · ${c.caseNumber}`,
      href: `/cases/${c.slug}`,
      decisionDate: c.decisionDate,
      voteSplit,
      podcastEpisodeUrl: c.podcastEpisodeUrl,
    };
  });
  items.sort((a, b) => {
    const dateA = a.decisionDate ?? a.sub.split(" ")[0];
    const dateB = b.decisionDate ?? b.sub.split(" ")[0];
    return dateB.localeCompare(dateA);
  });
  return items;
}

const PAGE_SIZE = 3;

export default function HomePage() {
  const cases = getAllCases();
  const calendarJson = getCalendarJson();
  const calendarEvents = buildCalendarEvents(cases, calendarJson);
  const circuitMapData = getCircuitMapData();
  const justicesData = getJusticesData();
  const lawyersData = getLawyersData();
  const splitsData = getCircuitSplitsData();
  const splitSlugs = new Set(
    (splitsData?.splits ?? [])
      .filter((s) => s.relatedScotusSlug)
      .map((s) => s.relatedScotusSlug as string)
  );
  const articlesData = getArticlesData();
  const previewArticles = (articlesData?.articles ?? []).slice(0, 8);
  const caseMap = new Map(cases.map((c) => [c.slug, c.title]));

  // Pre-compute per-circuit split summaries for the map component
  const splitsByCircuit: Record<number, import("@/lib/circuits").CircuitSplitSummary[]> = {};
  for (const split of splitsData?.splits ?? []) {
    for (const pos of split.positions) {
      for (const c of pos.circuits) {
        const num = circuitKeyToNumber(c.key);
        if (!num) continue;
        if (!splitsByCircuit[num]) splitsByCircuit[num] = [];
        splitsByCircuit[num].push({
          splitId: split.id,
          legalQuestion: split.legalQuestion,
          area: split.area,
          positionLabel: pos.label,
          status: split.status,
          relatedScotusSlug: split.relatedScotusSlug ?? null,
        });
      }
    }
  }
  const totalSplits = splitsData?.splits.length ?? 0;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

  const casesByCircuit = groupCasesByCircuit(cases, today);

  const upcoming: CaseSummary[] = [];
  const argued: CaseSummary[] = [];
  const decidedCases: CaseSummary[] = [];

  for (const c of cases) {
    const status = getDocketStatus(c);
    if (status === "upcoming") upcoming.push(c);
    else if (status === "argued") argued.push(c);
    else decidedCases.push(c);
  }

  // Upcoming: soonest first (ascending)
  upcoming.sort((a, b) => a.argumentDate.localeCompare(b.argumentDate));
  // Argued: most recent first — getAllCases() already returns descending, no change needed

  const decided = buildDecidedList(decidedCases);

  return (
    <main className="min-h-screen bg-ft-paper">
      <header className="bg-ft-pink pt-10 px-6">
        <h1 className="mx-auto text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight text-center">
          <span style={{ fontFamily: "Graphika81, Georgia, serif" }}>SCOTUS Dashboard</span>
        </h1>
        <NavBar />
      </header>

      {/* Docket + Circuit Splits + Analysis sidebar — unified 4-col layout */}
      <section id="docket" className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-y-6 items-stretch">

          {/* Left 3 cols: Docket then Circuit Splits */}
          <div className="lg:col-span-3 flex flex-col lg:pr-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-8">The Docket</h2>

            {/* Docket sub-columns */}
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

                {/* Upcoming Oral Arguments */}
                <div className="flex flex-col">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-2 mb-4">
                    Upcoming
                  </h3>
                  {upcoming.length === 0 ? (
                    <p className="text-gray-400 text-sm italic">No cases</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3">
                        {upcoming.slice(0, PAGE_SIZE).map((c) => {
                          const isToday = c.argumentDate === today;
                          const isTomorrow = c.argumentDate === tomorrow;
                          if (isToday) {
                            return (
                              <div key={c.slug} className="bg-white rounded p-4 border-2 border-green-500">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs text-gray-400">{c.termYear} Term · {c.caseNumber}</p>
                                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Today at 10:00</span>
                                    <a href="https://www.supremecourt.gov/oral_arguments/live.aspx" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors">
                                      Listen Live ↗
                                    </a>
                                    {splitSlugs.has(c.slug) && (
                                      <Link href="/appeals" className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full hover:bg-orange-100 transition-colors">
                                        Circuit Split
                                      </Link>
                                    )}
                                  </div>
                                </div>
                                <Link href={`/cases/${c.slug}`} className="text-sm font-semibold text-gray-900 leading-snug hover:text-blue-700 hover:underline">
                                  {c.title}
                                </Link>
                                <p className="text-xs text-gray-500 mt-1">{formatDate(c.argumentDate)}</p>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={c.slug}
                              className={`bg-white rounded p-4 hover:shadow-sm transition-all ${
                                isTomorrow
                                  ? "border-2 border-yellow-400"
                                  : "border border-gray-200 hover:border-gray-400"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-gray-400">{c.termYear} Term · {c.caseNumber}</p>
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  {isTomorrow && (
                                    <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">Tomorrow at 10:00</span>
                                  )}
                                  {splitSlugs.has(c.slug) && (
                                    <Link href="/appeals" className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full hover:bg-orange-100 transition-colors">
                                      Circuit Split
                                    </Link>
                                  )}
                                </div>
                              </div>
                              <Link href={`/cases/${c.slug}`} className="block text-sm font-semibold text-gray-900 leading-snug hover:text-blue-700 hover:underline">
                                {c.title}
                              </Link>
                              <p className="text-xs text-gray-500 mt-1">{formatDate(c.argumentDate)}</p>
                            </div>
                          );
                        })}
                      </div>
                      {upcoming.length > PAGE_SIZE && (
                        <Link
                          href="/docket/upcoming"
                          className="mt-4 text-center text-sm text-blue-600 hover:underline border border-blue-200 rounded py-2 bg-white hover:bg-blue-50 transition-colors"
                        >
                          View all {upcoming.length} cases →
                        </Link>
                      )}
                    </>
                  )}
                </div>

                {/* Argued */}
                <div className="flex flex-col">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-2 mb-4">
                    Argued
                  </h3>
                  {argued.length === 0 ? (
                    <p className="text-gray-400 text-sm italic">No cases</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3">
                        {argued.slice(0, PAGE_SIZE).map((c) => (
                          <div key={c.slug} className="bg-white border border-gray-200 rounded p-4 hover:border-gray-400 hover:shadow-sm transition-all">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs text-gray-400">{c.termYear} Term · {c.caseNumber}</p>
                              {splitSlugs.has(c.slug) && (
                                <Link href="/appeals" className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full hover:bg-orange-100 transition-colors">
                                  Circuit Split
                                </Link>
                              )}
                            </div>
                            <Link href={`/cases/${c.slug}`} className="block text-sm font-semibold text-gray-900 leading-snug hover:text-blue-700 hover:underline">
                              {c.title}
                            </Link>
                            <p className="text-xs text-gray-500 mt-1">Argued {formatDate(c.argumentDate)}</p>
                            {c.podcastEpisodeUrl && (
                              <a href={c.podcastEpisodeUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-xs text-green-700 hover:underline">
                                Listen on Spotify ↗
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                      {argued.length > PAGE_SIZE && (
                        <Link
                          href="/docket/argued"
                          className="mt-4 text-center text-sm text-blue-600 hover:underline border border-blue-200 rounded py-2 bg-white hover:bg-blue-50 transition-colors"
                        >
                          View all {argued.length} cases →
                        </Link>
                      )}
                    </>
                  )}
                </div>

                {/* Decided */}
                <div className="flex flex-col">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-2 mb-4">
                    Decided
                  </h3>
                  {decided.length === 0 ? (
                    <p className="text-gray-400 text-sm italic">No cases</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3">
                        {decided.slice(0, PAGE_SIZE).map((item) => {
                          const isToday = item.decisionDate === today;
                          const borderCls = isToday ? "border-2 border-green-500" : "border border-gray-200 hover:border-gray-400";
                          return (
                            <div key={item.slug} className={`bg-white rounded p-4 hover:shadow-sm transition-all ${borderCls}`}>
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-gray-400">{item.sub}</p>
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  {isToday && <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Decided Today</span>}
                                  {splitSlugs.has(item.slug) && (
                                    <Link href="/appeals" className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full hover:bg-orange-100 transition-colors">
                                      Circuit Split
                                    </Link>
                                  )}
                                </div>
                              </div>
                              <Link href={item.href} className="block text-sm font-semibold text-gray-900 leading-snug hover:text-blue-700 hover:underline">
                                {item.title}
                              </Link>
                              <p className="text-xs text-gray-500 mt-1">
                                {item.decisionDate ? `Decided ${formatDate(item.decisionDate)}` : "Decided"}
                                {item.voteSplit ? ` · ${item.voteSplit}` : ""}
                              </p>
                              {item.podcastEpisodeUrl && (
                                <a href={item.podcastEpisodeUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-xs text-green-700 hover:underline">
                                  Listen on Spotify ↗
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {decided.length > PAGE_SIZE && (
                        <Link
                          href="/docket/decided"
                          className="mt-4 text-center text-sm text-blue-600 hover:underline border border-blue-200 rounded py-2 bg-white hover:bg-blue-50 transition-colors"
                        >
                          View all {decided.length} cases →
                        </Link>
                      )}
                    </>
                  )}
                </div>

              </div>
            </div>

            {/* Circuit Splits */}
            {(() => {
              const statusOrder: Record<string, number> = { scotus_pending: 0, open: 1 };
              const featured = [...(splitsData?.splits ?? [])]
                .filter((s) => s.status !== "scotus_resolved")
                .sort((a, b) => {
                  const od = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
                  if (od !== 0) return od;
                  return b.lastUpdated.localeCompare(a.lastUpdated);
                })
                .slice(0, 2);
              if (featured.length === 0) return null;
              return (
                <div id="circuit-splits" className="border-t border-gray-300 mt-10 pt-10">
                  <h2 className="text-2xl font-bold text-gray-800 mb-1">
                    Current Circuit Splits
                  </h2>
                  <p className="text-sm text-gray-500 mb-6">
                    These active circuit splits are currently before the Supreme Court. Cert has been granted and a decision is pending.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {featured.map((s) => (
                      <SplitCard key={s.id} split={s} />
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-gray-400">
                    Source: CourtListener &middot; Analysis: Claude AI &middot;{" "}
                    <a href="/appeals" className="text-blue-600 hover:underline">
                      See all circuit splits &rarr;
                    </a>
                  </p>
                </div>
              );
            })()}

          </div>{/* end left col-span-3 */}

          {/* Right col: Analysis & Opinions preview */}
          <div className="lg:col-span-1 flex flex-col lg:border-l lg:border-gray-300 lg:pl-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-8">
              Analysis<br />&amp; Opinions
            </h2>
            {previewArticles.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No articles yet.</p>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {previewArticles.map((article) => (
                    <div
                      key={article.id}
                      className="bg-white border border-gray-200 rounded p-4 hover:border-gray-400 hover:shadow-sm transition-all"
                    >
                      <p className="text-xs text-gray-400 mb-1">
                        {article.source}
                        {article.author ? ` · ${article.author}` : ""}
                      </p>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm font-semibold text-gray-900 leading-snug hover:text-blue-700 hover:underline"
                      >
                        {article.title} ↗
                      </a>
                      <p className="text-xs text-gray-500 mt-1">{article.publishedAt}</p>
                      {article.relatedCaseSlugs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {article.relatedCaseSlugs.map((slug) => {
                            const title = caseMap.get(slug);
                            if (!title) return null;
                            return (
                              <Link
                                key={slug}
                                href={`/cases/${slug}`}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                {title} →
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Link
                  href="/analysis"
                  className="mt-auto pt-4 text-center text-sm text-blue-600 hover:underline border border-blue-200 rounded py-2 bg-white hover:bg-blue-50 transition-colors"
                >
                  View all analysis →
                </Link>
              </>
            )}
          </div>

        </div>
      </section>

      <section id="circuit-map" className="max-w-7xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Cases by Circuit</h2>
        <p className="text-sm text-gray-500 mb-6">
          Upcoming and pending-decision cases mapped by the federal appeals court circuit they originated in.
          Hover over a state or badge to see cases. Bold lines show circuit boundaries; thinner lines show state borders.
        </p>
        <CircuitMap mapData={circuitMapData} casesByCircuit={casesByCircuit} splitsByCircuit={splitsByCircuit} />
      </section>

      <section id="court-calendar" className="max-w-7xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Court Calendar</h2>
        <p className="text-sm text-gray-500 mb-6">
          Oral argument sessions and conference dates for the October Term 2025.
          Argument dates link to case pages. Conference dates are when the Justices
          meet privately to discuss pending petitions and argued cases.
        </p>
        <CourtCalendar events={calendarEvents} today={today} />
      </section>

      {justicesData && (
        <section id="justices" className="max-w-7xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Justices</h2>
          <p className="text-sm text-gray-500 mb-6">
            Speaking turns and estimated speaking time per justice across all{" "}
            {justicesData.term} term oral arguments, ranked by time on record.
          </p>
          <JusticesSection justices={justicesData.justices} />
        </section>
      )}

      {lawyersData && (
        <section id="counsel" className="max-w-7xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Counsel</h2>
          <p className="text-sm text-gray-500 mb-6">
            Attorneys with 2 or more cases in the {lawyersData.term} term, ranked by speaking time.
            Click a name to see the cases they argued.
          </p>
          <LawyersSection lawyers={lawyersData.lawyers.filter((l) => l.casesArgued >= 2)} />
        </section>
      )}

      <section id="about" className="bg-ft-paper border-t border-[#e8d0b8] px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">About</h2>
          <p className="text-base text-gray-600 leading-relaxed">
            This site tracks upcoming and recent oral arguments before the United States Supreme Court.
            Case information is compiled directly from official Supreme Court records, including transcripts, docket filings, and published opinions.
            Summaries, legal term explanations, and party position analyses are generated using AI and are intended to orient readers and direct further human research and analysis. They should not be treated as legal advice or authoritative legal commentary.
            Click any case to read a plain-English breakdown of the facts, the legal question, and each side&rsquo;s argument.
            The site is updated automatically each day at 5pm ET.
            Built by William Higgins.
            For comments or suggestions, contact <a href="mailto:william.higgins@sciencespo.fr" className="text-blue-600 hover:underline">william.higgins@sciencespo.fr</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
