import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllCases } from "@/lib/data";
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
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to Docket
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">
            {COLUMN_LABELS[col]}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {col === "upcoming" && `${upcoming.length} cases scheduled`}
            {col === "argued" && `${argued.length} cases argued, awaiting decision`}
            {col === "decided" && `${decided.length} entries`}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {col === "upcoming" && (
          <UpcomingList cases={upcoming} today={today} tomorrow={tomorrow} />
        )}
        {col === "argued" && (
          <ArguedList cases={argued} />
        )}
        {col === "decided" && (
          <DecidedList items={decided} today={today} />
        )}
      </div>
    </main>
  );
}

function UpcomingList({ cases, today, tomorrow }: { cases: CaseSummary[]; today: string; tomorrow: string }) {
  if (cases.length === 0)
    return <p className="text-gray-400 italic">No upcoming cases.</p>;

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
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
            {formatDate(date)}
          </h2>
          <div className="flex flex-col gap-3">
            {dateCases.map((c) => {
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
                      </div>
                    </div>
                    <Link href={`/cases/${c.slug}`} className="text-sm font-semibold text-gray-900 leading-snug hover:text-blue-700 hover:underline">
                      {c.title}
                    </Link>
                  </div>
                );
              }
              return (
                <Link
                  key={c.slug}
                  href={`/cases/${c.slug}`}
                  className={`block bg-white rounded p-4 hover:shadow-sm transition-all ${
                    isTomorrow
                      ? "border-2 border-yellow-400"
                      : "border border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-400">{c.termYear} Term · {c.caseNumber}</p>
                    {isTomorrow && (
                      <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">Tomorrow at 10:00</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{c.title}</p>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArguedList({ cases }: { cases: CaseSummary[] }) {
  if (cases.length === 0)
    return <p className="text-gray-400 italic">No argued cases.</p>;

  return (
    <div className="flex flex-col gap-3">
      {cases.map((c) => (
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
  );
}

function DecidedList({ items, today }: { items: DecidedItem[]; today: string }) {
  if (items.length === 0)
    return <p className="text-gray-400 italic">No decided cases.</p>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Link
          key={item.slug}
          href={item.href}
          className={`block bg-white rounded p-4 hover:shadow-sm transition-all ${
            item.decisionDate === today
              ? "border-2 border-green-500"
              : "border border-gray-200 hover:border-gray-400"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">{item.sub}</p>
            {item.decisionDate === today && (
              <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Decided Today</span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {item.title}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {item.decisionDate ? `Decided ${formatDate(item.decisionDate)}` : "Decided"}
            {item.voteSplit ? ` · ${item.voteSplit}` : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}
