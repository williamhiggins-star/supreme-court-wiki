import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllCases } from "@/lib/data";
import { getCircuitSplitsData } from "@/lib/circuit-splits";
import {
  formatDate,
  getDocketStatus,
  buildDecidedList,
  type DecidedItem,
} from "@/app/page";
import type { CaseSummary } from "@/types";

type Column = "upcoming" | "argued" | "decided";

const COLUMN_LABELS: Record<Column, string> = {
  upcoming: "Upcoming Oral Arguments",
  argued: "Argued — Awaiting Decision",
  decided: "Decided",
};

// Revalidate every hour so "Decided Today" / "Today" badges clear within 24 h.
export const revalidate = 3600;

export function generateStaticParams() {
  return [
    { column: "upcoming" },
    { column: "argued" },
    { column: "decided" },
  ];
}

export default async function DocketColumnPage({
  params,
}: {
  params: Promise<{ column: string }>;
}) {
  const { column } = await params;

  if (!["upcoming", "argued", "decided"].includes(column)) notFound();
  const col = column as Column;

  const cases = getAllCases();

  const splitsData = getCircuitSplitsData();
  const splitSlugs = new Set(
    (splitsData?.splits ?? [])
      .filter((s) => s.relatedScotusSlug)
      .map((s) => s.relatedScotusSlug as string)
  );

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

  const upcoming: CaseSummary[] = [];
  const argued: CaseSummary[] = [];
  const decidedCases: CaseSummary[] = [];

  for (const c of cases) {
    const status = getDocketStatus(c);
    if (status === "upcoming") upcoming.push(c);
    else if (status === "argued") argued.push(c);
    else decidedCases.push(c);
  }

  upcoming.sort((a, b) => a.argumentDate.localeCompare(b.argumentDate));
  // argued is already descending from getAllCases()

  const decided = buildDecidedList(decidedCases);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <header className="bg-[var(--cream)] border-b border-[var(--tan)]">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link
            href="/"
            className="text-[var(--warm-gray)] hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            &larr; Back to Docket
          </Link>
          <h1
            className="mt-3 text-2xl text-[var(--charcoal)]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
          >
            {COLUMN_LABELS[col]}
          </h1>
          <p className="mt-1 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
            {col === "upcoming" && `${upcoming.length} cases scheduled`}
            {col === "argued" && `${argued.length} cases argued, awaiting decision`}
            {col === "decided" && `${decided.length} entries`}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {col === "upcoming" && (
          <UpcomingList cases={upcoming} today={today} tomorrow={tomorrow} splitSlugs={splitSlugs} />
        )}
        {col === "argued" && (
          <ArguedList cases={argued} splitSlugs={splitSlugs} />
        )}
        {col === "decided" && (
          <DecidedList items={decided} today={today} splitSlugs={splitSlugs} />
        )}
      </div>
    </main>
  );
}

function UpcomingList({ cases, today, tomorrow, splitSlugs }: { cases: CaseSummary[]; today: string; tomorrow: string; splitSlugs: Set<string> }) {
  if (cases.length === 0)
    return <p className="text-[var(--warm-gray)] italic" style={{ fontFamily: "'Lora', Georgia, serif" }}>No upcoming cases.</p>;

  // Group by argument date for easier scanning
  const grouped = new Map<string, CaseSummary[]>();
  for (const c of cases) {
    const key = c.argumentDate;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([date, dateCases]) => (
        <div key={date}>
          <h2
            className="mb-2 text-[var(--warm-gray)]"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            {formatDate(date)}
          </h2>
          <div className="flex flex-col gap-3">
            {dateCases.map((c) => {
              const isToday = c.argumentDate === today;
              const isTomorrow = c.argumentDate === tomorrow;
              if (isToday) {
                return (
                  <div key={c.slug} className="bg-[var(--ivory)] rounded p-4 border-2 border-[var(--rust)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    <div className="flex items-center justify-between mb-1">
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)]">{c.termYear} Term · {c.caseNumber}</p>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span
                          className="px-2 py-0.5 rounded-[3px] border border-[var(--rust)] bg-[var(--rust)]/10 text-[var(--rust)]"
                          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
                        >
                          Today at 10:00
                        </span>
                        <a href="https://www.supremecourt.gov/oral_arguments/live.aspx" target="_blank" rel="noopener noreferrer"
                          className="px-2 py-0.5 rounded-[3px] border border-[var(--rust)] bg-[var(--rust)]/10 text-[var(--rust)] hover:bg-[var(--rust)]/20 transition-colors"
                          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
                        >
                          Listen Live
                        </a>
                        {splitSlugs.has(c.slug) && (
                          <Link href="/appeals"
                            className="px-2 py-0.5 rounded-[3px] border border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors"
                            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}
                          >
                            Circuit Split
                          </Link>
                        )}
                      </div>
                    </div>
                    <Link href={`/cases/${c.slug}`}
                      className="text-[var(--charcoal)] leading-snug hover:text-[var(--rust)] transition-colors"
                      style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "15px" }}
                    >
                      {c.title}
                    </Link>
                  </div>
                );
              }
              return (
                <div
                  key={c.slug}
                  className={`bg-[var(--ivory)] rounded p-4 hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${
                    isTomorrow
                      ? "border-2 border-[var(--gold)]"
                      : "border border-[var(--tan)] hover:border-[var(--rust)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)]">{c.termYear} Term · {c.caseNumber}</p>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {isTomorrow && (
                        <span
                          className="px-2 py-0.5 rounded-[3px] border border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]"
                          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
                        >
                          Tomorrow at 10:00
                        </span>
                      )}
                      {splitSlugs.has(c.slug) && (
                        <Link href="/appeals"
                          className="px-2 py-0.5 rounded-[3px] border border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors"
                          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}
                        >
                          Circuit Split
                        </Link>
                      )}
                    </div>
                  </div>
                  <Link href={`/cases/${c.slug}`}
                    className="block text-[var(--charcoal)] leading-snug hover:text-[var(--rust)] transition-colors"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "15px" }}
                  >
                    {c.title}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArguedList({ cases, splitSlugs }: { cases: CaseSummary[]; splitSlugs: Set<string> }) {
  if (cases.length === 0)
    return <p className="text-[var(--warm-gray)] italic" style={{ fontFamily: "'Lora', Georgia, serif" }}>No argued cases.</p>;

  return (
    <div className="flex flex-col gap-3">
      {cases.map((c) => (
        <div key={c.slug} className="bg-[var(--ivory)] border border-[var(--tan)] rounded p-4 hover:border-[var(--rust)] hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-1">
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)]">{c.termYear} Term · {c.caseNumber}</p>
            {splitSlugs.has(c.slug) && (
              <Link href="/appeals"
                className="px-2 py-0.5 rounded-[3px] border border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors"
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}
              >
                Circuit Split
              </Link>
            )}
          </div>
          <Link href={`/cases/${c.slug}`}
            className="block text-[var(--charcoal)] leading-snug hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "15px" }}
          >
            {c.title}
          </Link>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] mt-1">Argued {formatDate(c.argumentDate)}</p>
          {c.podcastEpisodeUrl && (
            <a href={c.podcastEpisodeUrl} target="_blank" rel="noopener noreferrer"
              className="mt-1.5 block text-[var(--forest)] hover:underline"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}
            >
              Listen on Spotify
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function DecidedList({ items, today, splitSlugs }: { items: DecidedItem[]; today: string; splitSlugs: Set<string> }) {
  if (items.length === 0)
    return <p className="text-[var(--warm-gray)] italic" style={{ fontFamily: "'Lora', Georgia, serif" }}>No decided cases.</p>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const isToday = item.decisionDate === today;
        const borderCls = isToday ? "border-2 border-[var(--forest)]" : "border border-[var(--tan)] hover:border-[var(--rust)]";
        return (
          <div key={item.slug} className={`bg-[var(--ivory)] rounded p-4 hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${borderCls}`}>
            <div className="flex items-center justify-between mb-1">
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)]">{item.sub}</p>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {isToday && (
                  <span
                    className="px-2 py-0.5 rounded-[3px] border border-[var(--forest)] bg-[var(--forest)]/10 text-[var(--forest)]"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
                  >
                    Decided Today
                  </span>
                )}
                {splitSlugs.has(item.slug) && (
                  <Link href="/appeals"
                    className="px-2 py-0.5 rounded-[3px] border border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}
                  >
                    Circuit Split
                  </Link>
                )}
              </div>
            </div>
            <Link href={item.href}
              className="block text-[var(--charcoal)] leading-snug hover:text-[var(--rust)] transition-colors"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "15px" }}
            >
              {item.title}
            </Link>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] mt-1">
              {item.decisionDate ? `Decided ${formatDate(item.decisionDate)}` : "Decided"}
              {item.voteSplit ? ` · ${item.voteSplit}` : ""}
            </p>
            {item.podcastEpisodeUrl && (
              <a href={item.podcastEpisodeUrl} target="_blank" rel="noopener noreferrer"
                className="mt-1.5 block text-[var(--forest)] hover:underline"
                style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}
              >
                Listen on Spotify
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
