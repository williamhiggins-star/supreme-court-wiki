import Link from "next/link";
import { getAllCases, getAllPrecedents } from "@/lib/data";
import { getCalendarJson, buildCalendarEvents } from "@/lib/calendar";
import { getCircuitMapData } from "@/lib/circuits-server";
import { groupCasesByCircuit, circuitKeyToNumber } from "@/lib/circuits";
import { getCircuitSplitsData } from "@/lib/circuit-splits";
import { getJusticesData } from "@/lib/justices";
import { getLawyersData } from "@/lib/lawyers";
import { CourtCalendar } from "@/components/CourtCalendar";
import { CircuitMap } from "@/components/CircuitMap";
import { JusticesSection } from "@/components/JusticesSection";
import { LawyersSection } from "@/components/LawyersSection";
import { NavBar } from "@/components/NavBar";
import type { CaseSummary, PrecedentCase } from "@/types";

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
  if (c.docketStatus === "upcoming") return "upcoming";
  if (c.outcome) return "decided";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = c.argumentDate.split("-").map(Number);
  const argDate = new Date(y, m - 1, d);
  if (argDate >= today) return "upcoming";
  return "argued";
}

export type DecidedItem =
  | { type: "case"; slug: string; title: string; sub: string; href: string }
  | { type: "precedent"; slug: string; name: string; year: number; href: string };

export function buildDecidedList(
  decidedCases: CaseSummary[],
  precedents: PrecedentCase[]
): DecidedItem[] {
  const items: DecidedItem[] = [
    ...decidedCases.map((c) => ({
      type: "case" as const,
      slug: c.slug,
      title: c.title,
      sub: `${c.termYear} Term · ${c.caseNumber}`,
      href: `/cases/${c.slug}`,
    })),
    ...precedents.map((p) => ({
      type: "precedent" as const,
      slug: p.slug,
      name: p.name,
      year: p.year,
      href: `/precedents/${p.slug}`,
    })),
  ];
  items.sort((a, b) => {
    const yearA = a.type === "case" ? parseInt(a.sub.split(" ")[0]) : a.year;
    const yearB = b.type === "case" ? parseInt(b.sub.split(" ")[0]) : b.year;
    return yearB - yearA;
  });
  return items;
}

const PAGE_SIZE = 10;

export default function HomePage() {
  const cases = getAllCases();
  const precedents = getAllPrecedents();
  const calendarJson = getCalendarJson();
  const calendarEvents = buildCalendarEvents(cases, calendarJson);
  const circuitMapData = getCircuitMapData();
  const justicesData = getJusticesData();
  const lawyersData = getLawyersData();
  const splitsData = getCircuitSplitsData();

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

  const decided = buildDecidedList(decidedCases, precedents);

  return (
    <main className="min-h-screen bg-ft-paper">
      <header className="bg-ft-pink pt-10 px-6">
        <h1 className="mx-auto text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight text-center">
          <span style={{ fontFamily: "Graphika81, Georgia, serif" }}>Supreme Court Tracker</span>
        </h1>
        <NavBar />
      </header>

      <section id="docket" className="max-w-7xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-800 mb-8">The Docket</h2>
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
                  {upcoming.slice(0, PAGE_SIZE).map((c) => (
                    <Link
                      key={c.slug}
                      href={`/cases/${c.slug}`}
                      className="block bg-white border border-gray-200 rounded p-4 hover:border-gray-400 hover:shadow-sm transition-all"
                    >
                      <p className="text-xs text-gray-400 mb-1">
                        {c.termYear} Term · {c.caseNumber}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {c.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(c.argumentDate)}
                      </p>
                    </Link>
                  ))}
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
                    <Link
                      key={c.slug}
                      href={`/cases/${c.slug}`}
                      className="block bg-white border border-gray-200 rounded p-4 hover:border-gray-400 hover:shadow-sm transition-all"
                    >
                      <p className="text-xs text-gray-400 mb-1">
                        {c.termYear} Term · {c.caseNumber}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {c.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Argued {formatDate(c.argumentDate)}
                      </p>
                    </Link>
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
                <div className="flex flex-col gap-2">
                  {decided.slice(0, PAGE_SIZE).map((item) =>
                    item.type === "case" ? (
                      <Link
                        key={item.slug}
                        href={item.href}
                        className="block bg-white border border-gray-200 rounded p-4 hover:border-gray-400 hover:shadow-sm transition-all"
                      >
                        <p className="text-xs text-gray-400 mb-1">{item.sub}</p>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">
                          {item.title}
                        </p>
                      </Link>
                    ) : (
                      <Link
                        key={item.slug}
                        href={item.href}
                        className="block bg-white border border-gray-200 rounded px-4 py-3 hover:border-gray-400 hover:shadow-sm transition-all"
                      >
                        <p className="text-xs text-gray-400 mb-0.5">{item.year}</p>
                        <p className="text-sm text-gray-800 leading-snug">
                          {item.name}
                        </p>
                      </Link>
                    )
                  )}
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
            Top {Math.min(30, lawyersData.lawyers.length)} attorneys by speaking time across all{" "}
            {lawyersData.term} term oral arguments. Click a name to see the cases they argued.
          </p>
          <LawyersSection lawyers={lawyersData.lawyers} />
        </section>
      )}

      <section id="circuit-map" className="max-w-7xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Cases by Circuit</h2>
        <p className="text-sm text-gray-500 mb-6">
          Upcoming and pending-decision cases mapped by the federal appeals court circuit they originated in.
          Hover over a state or badge to see cases. Bold lines show circuit boundaries; thinner lines show state borders.
        </p>
        <CircuitMap mapData={circuitMapData} casesByCircuit={casesByCircuit} splitsByCircuit={splitsByCircuit} totalSplits={totalSplits} />
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

      <section id="about" className="bg-ft-paper border-t border-[#e8d0b8] px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">About</h2>
          <p className="text-base text-gray-600 leading-relaxed">
            This site tracks upcoming and recent oral arguments before the United States Supreme Court.
            Case information is compiled directly from official Supreme Court records, including transcripts, docket filings, and published opinions.
            Summaries, legal term explanations, and party position analyses are generated using AI and are intended to orient readers and direct further human research and analysis. They should not be treated as legal advice or authoritative legal commentary.
            Click any case to read a plain-English breakdown of the facts, the legal question, and each side&rsquo;s argument.
            The site is updated automatically each day at 5pm ET.
            For comments or suggestions, contact <a href="mailto:william.higgins@sciencespo.fr" className="text-blue-600 hover:underline">william.higgins@sciencespo.fr</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
