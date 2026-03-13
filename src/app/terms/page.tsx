import Link from "next/link";
import { getAllTerms } from "@/lib/data";

export default function TermsIndexPage() {
  const terms = getAllTerms();

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
            Legal Glossary
          </h1>
          <p className="mt-1 text-[var(--warm-gray)]" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
            Plain-English definitions of legal terms used in Supreme Court
            arguments
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {terms.length === 0 ? (
          <p className="text-[var(--warm-gray)] text-center py-16" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            Terms will appear here after processing transcripts.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {terms.map((t) => (
              <Link
                key={t.slug}
                href={`/terms/${t.slug}`}
                className="block bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-5 hover:border-[var(--rust)] hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              >
                <p
                  className="text-[var(--charcoal)]"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "16px" }}
                >
                  {t.term}
                </p>
                <p className="mt-1 text-[var(--charcoal)] line-clamp-2" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
                  {t.definition}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
