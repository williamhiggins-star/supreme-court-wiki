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
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <Link href="/terms" className="text-sm text-blue-600 hover:underline">
            ← Legal Glossary
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">{term.term}</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Definition
          </h2>
          <p className="text-gray-800 leading-relaxed text-lg">
            {term.definition}
          </p>
        </section>

        {term.examples && term.examples.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Examples
            </h2>
            <ul className="space-y-2">
              {term.examples.map((ex, i) => (
                <li key={i} className="flex gap-2 text-gray-700">
                  <span className="text-blue-400 mt-0.5">•</span>
                  {ex}
                </li>
              ))}
            </ul>
          </section>
        )}

        {term.relatedTerms && term.relatedTerms.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Related Terms
            </h2>
            <div className="flex flex-wrap gap-2">
              {term.relatedTerms.map((related) => {
                const relatedSlug = related.toLowerCase().replace(/\s+/g, "-");
                return (
                  <Link
                    key={related}
                    href={`/terms/${relatedSlug}`}
                    className="inline-block bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
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
