import Link from "next/link";
import { getAllPrecedents } from "@/lib/data";

export default function PrecedentsIndexPage() {
  const precedents = getAllPrecedents();
  const enriched = precedents.filter((p) => p.parties && p.parties.length > 0);
  const stubs = precedents.filter(
    (p) => !p.parties || p.parties.length === 0
  );

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <header className="bg-[var(--cream)] border-b border-[var(--tan)]">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link
            href="/"
            className="text-[var(--warm-gray)] hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            &larr; Home
          </Link>
          <h1
            className="mt-3 text-2xl text-[var(--charcoal)]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
          >
            Key Precedent Cases
          </h1>
          <p className="mt-1 text-[var(--warm-gray)]" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
            Landmark cases cited in Supreme Court oral arguments
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {precedents.length === 0 ? (
          <p className="text-[var(--warm-gray)] text-center py-16" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            Precedents will appear here after processing transcripts.
          </p>
        ) : (
          <div className="space-y-10">
            {enriched.length > 0 && (
              <div>
                <h2
                  className="mb-4 text-[var(--warm-gray)]"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
                >
                  Full entries — {enriched.length}
                </h2>
                <div className="space-y-3">
                  {enriched.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/precedents/${p.slug}`}
                      className="block bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-5 hover:border-[var(--rust)] hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[var(--charcoal)]"
                            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "16px" }}
                          >
                            {p.name}
                          </p>
                          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] mt-0.5">
                            {p.citation && `${p.citation} · `}{p.year ?? ""}
                            {p.voteCount && ` · ${p.voteCount}`}
                          </p>
                          <p className="text-[var(--charcoal)] mt-1.5 leading-relaxed line-clamp-2" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
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
                <h2
                  className="mb-4 text-[var(--warm-gray)]"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
                >
                  Stubs — {stubs.length}
                  <span className="ml-2 font-normal normal-case text-[var(--warm-gray)]" style={{ fontSize: "11px" }}>
                    Run{" "}
                    <code style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="bg-[var(--ivory)] px-1 rounded border border-[var(--tan)]">
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
                      className="block bg-[var(--ivory)] rounded-lg border border-[var(--tan)] border-dashed p-5 hover:border-[var(--rust)] hover:shadow-md transition-all opacity-75"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[var(--charcoal)]"
                            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "16px" }}
                          >
                            {p.name}
                          </p>
                          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] mt-0.5">
                            {p.citation && `${p.citation} · `}{p.year ?? ""}
                          </p>
                          <p className="text-[var(--charcoal)] mt-1.5 leading-relaxed line-clamp-2" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
                            {p.summary}
                          </p>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-[3px] whitespace-nowrap border border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]"
                          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
                        >
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
