import Link from "next/link";
import { getAllCases, getAllPrecedents } from "@/lib/data";
import type { CaseSummary, PrecedentCase } from "@/types";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDocketStatus(c: CaseSummary): "upcoming" | "argued" | "decided" {
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

type DecidedItem =
  | { type: "case"; slug: string; title: string; sub: string; href: string }
  | { type: "precedent"; slug: string; name: string; year: number; href: string };

export default function HomePage() {
  const cases = getAllCases();
  const precedents = getAllPrecedents();

  const upcoming: CaseSummary[] = [];
  const argued: CaseSummary[] = [];
  const decidedCases: CaseSummary[] = [];

  for (const c of cases) {
    const status = getDocketStatus(c);
    if (status === "upcoming") upcoming.push(c);
    else if (status === "argued") argued.push(c);
    else decidedCases.push(c);
  }

  const decided: DecidedItem[] = [
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

  // Sort decided: cases first (most recent argument date), then precedents (most recent year)
  decided.sort((a, b) => {
    const yearA = a.type === "case"
      ? parseInt(a.sub.split(" ")[0])
      : a.year;
    const yearB = b.type === "case"
      ? parseInt(b.sub.split(" ")[0])
      : b.year;
    return yearB - yearA;
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            Supreme Court Oral Arguments Tracker
          </h1>
          <p className="mt-5 text-base text-gray-600 leading-relaxed">
            This site tracks upcoming and recent oral arguments before the United States Supreme Court.
            Case information is compiled directly from official Supreme Court records, including transcripts, docket filings, and published opinions.
            Summaries, legal term explanations, and party position analyses are generated using AI and are intended to orient readers and direct further human research and analysis — they should not be treated as legal advice or authoritative legal commentary.
            Click any case to read a plain-English breakdown of the facts, the legal question, and each side&rsquo;s argument.
          </p>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-800 mb-8">The Docket</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

          {/* Upcoming Oral Arguments */}
          <div className="flex flex-col">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-2 mb-4">
              Upcoming Oral Arguments
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No cases</p>
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((c) => (
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
            )}
          </div>

          {/* Argued */}
          <div className="flex flex-col">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-2 mb-4">
              Argued
            </h3>
            {argued.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No cases</p>
            ) : (
              <div className="flex flex-col gap-3">
                {argued.map((c) => (
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
            )}
          </div>

          {/* Decided */}
          <div className="flex flex-col">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-2 mb-4">
              Decided
            </h3>
            {decided.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No cases</p>
            ) : (
              <div className="flex flex-col gap-2">
                {decided.map((item) =>
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
            )}
          </div>

        </div>
      </section>
    </main>
  );
}
