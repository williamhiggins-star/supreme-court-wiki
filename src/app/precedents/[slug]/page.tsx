import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrecedentBySlug, getAllPrecedents, getAllCases } from "@/lib/data";
import { PrecedentDecisionSection } from "@/components/PrecedentDecisionSection";

export async function generateStaticParams() {
  return getAllPrecedents().map((p) => ({ slug: p.slug }));
}

export default async function PrecedentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = getPrecedentBySlug(slug);
  if (!p) notFound();

  const isEnriched = !!(p.parties && p.parties.length > 0 && p.holding);

  const citingCases = getAllCases().filter((c) =>
    c.citedPrecedents.some((cp) => cp.caseSlug === slug)
  );

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link href="/precedents" className="text-sm text-blue-600 hover:underline">
            ← Key Precedents
          </Link>
          <div className="mt-3">
            <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-400">
              {p.citation && <span>{p.citation}</span>}
              {p.year && (
                <>
                  <span>·</span>
                  <span>{p.year}</span>
                </>
              )}
            </div>
          </div>
          {p.legalQuestion && (
            <p className="mt-3 text-base text-gray-600 leading-relaxed">
              {p.legalQuestion}
            </p>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {isEnriched ? (
          <>
            {/* Decision — vote split, majority opinion, concurrences, dissents */}
            <Section title="The Decision">
              <PrecedentDecisionSection p={p} />
            </Section>

            {/* Background */}
            <Section title="Background & Facts">
              <Prose text={p.backgroundAndFacts!} />
            </Section>

            {/* Party arguments */}
            <Section title="The Arguments">
              <div className="space-y-6">
                {p.parties!.map((party) => (
                  <div
                    key={party.party}
                    className="bg-white rounded-lg border border-gray-200 p-6"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-semibold text-gray-900">
                        {party.party}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded capitalize">
                        {party.role}
                      </span>
                    </div>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      {party.coreArgument}
                    </p>
                    {party.supportingPoints.length > 0 && (
                      <ul className="space-y-1.5 text-sm text-gray-600 list-disc list-inside">
                        {party.supportingPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          </>
        ) : (
          <>
            <Section title="What the Court Decided">
              <p className="text-gray-700 leading-relaxed">{p.summary}</p>
            </Section>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-sm text-amber-800">
              Full entry not yet generated. Run{" "}
              <code className="font-mono bg-amber-100 px-1 rounded">
                npm run enrich-precedents
              </code>{" "}
              to add it.
            </div>
          </>
        )}

        {/* Cases on this site that cite it */}
        {citingCases.length > 0 && (
          <Section title="Cited In">
            <div className="space-y-3">
              {citingCases.map((c) => {
                const ref = c.citedPrecedents.find((cp) => cp.caseSlug === slug)!;
                return (
                  <Link
                    key={c.slug}
                    href={`/cases/${c.slug}`}
                    className="block bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all"
                  >
                    <p className="font-semibold text-gray-900">{c.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.termYear} Term · {c.caseNumber}
                    </p>
                    <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                      {ref.reasonCited}
                    </p>
                  </Link>
                );
              })}
            </div>
          </Section>
        )}

        {p.topics.length > 0 && (
          <Section title="Topics">
            <div className="flex flex-wrap gap-2">
              {p.topics.map((topic) => (
                <span
                  key={topic}
                  className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split("\n\n").map((para, i) => (
        <p key={i} className="text-gray-700 leading-relaxed">
          {para}
        </p>
      ))}
    </div>
  );
}
