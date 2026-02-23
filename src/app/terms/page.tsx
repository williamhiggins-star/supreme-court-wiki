import Link from "next/link";
import { getAllTerms } from "@/lib/data";

export default function TermsIndexPage() {
  const terms = getAllTerms();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Home
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">
            Legal Glossary
          </h1>
          <p className="mt-1 text-gray-500">
            Plain-English definitions of legal terms used in Supreme Court
            arguments
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {terms.length === 0 ? (
          <p className="text-gray-400 text-center py-16">
            Terms will appear here after processing transcripts.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {terms.map((t) => (
              <Link
                key={t.slug}
                href={`/terms/${t.slug}`}
                className="block bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all"
              >
                <p className="font-semibold text-gray-900">{t.term}</p>
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
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
