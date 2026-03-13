import Link from "next/link";
import { notFound } from "next/navigation";
import { getTermBySlug, getAllTerms } from "@/lib/data";

export async function generateStaticParams() {
  return getAllTerms().map((t) => ({ slug: t.slug }));
}

export default async function TermPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) notFound();

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <header className="bg-[var(--cream)] border-b border-[var(--tan)]">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <Link
            href="/terms"
            className="text-[var(--warm-gray)] hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            &larr; Legal Glossary
          </Link>
          <h1
            className="mt-3 text-2xl text-[var(--charcoal)]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
          >
            {term.term}
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <section>
          <h2
            className="mb-3 text-[var(--warm-gray)]"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            Definition
          </h2>
          <p className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "17px" }}>
            {term.definition}
          </p>
        </section>

        {term.examples && term.examples.length > 0 && (
          <section>
            <h2
              className="mb-3 text-[var(--warm-gray)]"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
            >
              Examples
            </h2>
            <ul className="space-y-2">
              {term.examples.map((ex, i) => (
                <li key={i} className="flex gap-2 text-[var(--charcoal)]" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
                  <span className="text-[var(--rust)] mt-0.5">•</span>
                  {ex}
                </li>
              ))}
            </ul>
          </section>
        )}

        {term.relatedTerms && term.relatedTerms.length > 0 && (
          <section>
            <h2
              className="mb-3 text-[var(--warm-gray)]"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
            >
              Related Terms
            </h2>
            <div className="flex flex-wrap gap-2">
              {term.relatedTerms.map((related) => {
                const relatedSlug = related.toLowerCase().replace(/\s+/g, "-");
                return (
                  <Link
                    key={related}
                    href={`/terms/${relatedSlug}`}
                    className="inline-block bg-[var(--forest)]/10 text-[var(--forest)] px-3 py-1.5 rounded-[3px] border border-[var(--forest)]/30 hover:bg-[var(--forest)]/20 transition-colors"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
                  >
                    {related}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
