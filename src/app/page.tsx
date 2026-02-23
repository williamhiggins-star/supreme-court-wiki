import Link from "next/link";
import { getAllCases } from "@/lib/data";
import type { CaseSummary } from "@/types";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDocketStatus(c: CaseSummary): "upcoming" | "petition" | "emergency" | "decided" {
  if (c.docketStatus) return c.docketStatus;
  if (c.outcome) return "decided";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = c.argumentDate.split("-").map(Number);
  const argDate = new Date(y, m - 1, d);
  if (argDate >= today) return "upcoming";
  return "petition";
}

type DocketColumn = {
  key: "upcoming" | "petition" | "emergency" | "decided";
  label: string;
};

const COLUMNS: DocketColumn[] = [
  { key: "upcoming", label: "Upcoming Oral Arguments" },
  { key: "petition", label: "Petitions to be Heard" },
  { key: "emergency", label: "Emergency Docket" },
  { key: "decided", label: "Decided" },
];

export default function HomePage() {
  const cases = getAllCases();

  const grouped: Record<string, CaseSummary[]> = {
    upcoming: [],
    petition: [],
    emergency: [],
    decided: [],
  };
  for (const c of cases) {
    grouped[getDocketStatus(c)].push(c);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Title */}
      <header className="bg-white border-b border-gray-200 py-10">
        <h1 className="text-4xl font-bold text-gray-900 text-center tracking-tight">
          The Supreme Court
        </h1>
      </header>

      {/* Docket */}
      <section className="max-w-7xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-800 mb-8">The Docket</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {COLUMNS.map(({ key, label }) => (
            <div key={key} className="flex flex-col">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-2 mb-4">
                {label}
              </h3>
              {grouped[key].length === 0 ? (
                <p className="text-gray-400 text-sm italic">No cases</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {grouped[key].map((c) => (
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
          ))}
        </div>
      </section>
    </main>
  );
}
