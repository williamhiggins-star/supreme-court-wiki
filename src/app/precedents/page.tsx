import Link from "next/link";
import { getAllPrecedents } from "@/lib/data";

export default function PrecedentsIndexPage() {
  const precedents = getAllPrecedents();
  const enriched = precedents.filter((p) => p.parties && p.parties.length > 0);
  const stubs = precedents.filter(
    (p) => !p.parties || p.parties.length === 0
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Home
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">
            Key Precedent Cases
          </h1>
          <p className="mt-1 text-gray-500">
            Landmark cases cited in Supreme Court oral arguments
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {precedents.length === 0 ? (
          <p className="text-gray-400 text-center py-16">
            Precedents will appear here after processing transcripts.
          </p>
        ) : (
          <div className="space-y-10">
            {enriched.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Full entries — {enriched.length}
                </h2>
                <div className="space-y-3">
                  {enriched.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/precedents/${p.slug}`}
                      className="block bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {p.citation && `${p.citation} · `}{p.year ?? ""}
                            {p.voteCount && ` · ${p.voteCount}`}
                          </p>
                          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed line-clamp-2">
                            {p.summary}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {stubs.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Stubs — {stubs.length}
                  <span className="ml-2 text-xs font-normal normal-case text-gray-400">
                    Run{" "}
                    <code className="font-mono bg-gray-100 px-1 rounded">
                      npm run enrich-precedents
                    </code>{" "}
                    to generate full entries
                  </span>
                </h2>
                <div className="space-y-3">
                  {stubs.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/precedents/${p.slug}`}
                      className="block bg-white rounded-lg border border-gray-200 border-dashed p-5 hover:border-blue-400 hover:shadow-sm transition-all opacity-75"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {p.citation && `${p.citation} · `}{p.year ?? ""}
                          </p>
                          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed line-clamp-2">
                            {p.summary}
                          </p>
                        </div>
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded whitespace-nowrap">
                          stub
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
