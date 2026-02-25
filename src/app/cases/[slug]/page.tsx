import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaseBySlug, getAllCases, getAllTerms } from "@/lib/data";
import { DecisionSection } from "@/components/DecisionSection";

export async function generateStaticParams() {
  return getAllCases().map((c) => ({ slug: c.slug }));
}

/** Parse a YYYY-MM-DD date string in local time (avoids UTC-midnight timezone shift). */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = getCaseBySlug(slug);
  if (!c) notFound();

  // Build a slug→term name lookup so pills show "Ghost Gun" not "ghost gun"
  const termMap = new Map(getAllTerms().map((t) => [t.slug, t.term]));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← All Cases
          </Link>
          <div className="mt-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {c.termYear} Term · {c.caseNumber}
            </span>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{c.title}</h1>
            <p className="mt-2 text-base text-gray-600 leading-relaxed">
              {c.legalQuestion}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm text-gray-400">
            {c.docketStatus === "upcoming" ? (
              <span className="text-blue-600 font-medium">
                Oral argument scheduled for {formatDate(c.argumentDate)} at 10:00 a.m. ET
              </span>
            ) : (
              <>
                <span>Argued {formatDate(c.argumentDate)}</span>
                {c.transcriptUrl && (
                  <a
                    href={c.transcriptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    Official Transcript ↗
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Decision — only for decided cases with author data */}
        {c.docketStatus === "decided" && c.majorityAuthor && (
          <Section title="The Decision">
            <DecisionSection c={c} />
          </Section>
        )}

        {/* Background */}
        <Section title="Background & Facts">
          <Prose text={c.backgroundAndFacts} />
        </Section>

        {/* Why it matters */}
        <Section title="Why This Case Matters">
          <Prose text={c.significance} />
        </Section>

        {/* Parties */}
        <Section title="The Arguments">
          {c.docketStatus === "upcoming" && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 text-sm text-blue-800">
              Oral argument is scheduled for {formatDate(c.argumentDate)} at 10:00 a.m. ET.
              The positions below reflect each party&rsquo;s written briefs. This section will be updated following argument.
            </div>
          )}
          <div className="space-y-8">
            {c.parties.map((party) => (
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
                {party.keyExchanges.length > 0 && (
                  <div className="mt-5 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      Key Exchanges with Justices
                    </h4>
                    {party.keyExchanges.map((ex, i) => (
                      <div key={i} className="pl-4 border-l-2 border-blue-200">
                        <p className="text-sm font-medium text-gray-800">
                          {ex.justice}
                        </p>
                        <p className="text-sm text-gray-600 mt-0.5 italic">
                          &ldquo;{ex.question}&rdquo;
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {ex.significance}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Precedents */}
        {c.citedPrecedents.length > 0 && (
          <Section title="Precedent Cases Cited">
            <div className="space-y-4">
              {c.citedPrecedents.map((p) => (
                <Link
                  key={p.caseSlug}
                  href={`/precedents/${p.caseSlug}`}
                  className="block bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {p.caseName}
                      </p>
                      {p.citation && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.citation}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {p.reasonCited}
                      </p>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded capitalize whitespace-nowrap">
                      {p.citedBy}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* Legal Terms */}
        {c.legalTermsUsed.length > 0 && (
          <Section title="Legal Terminology">
            <div className="flex flex-wrap gap-2">
              {c.legalTermsUsed.map((termSlug) => (
                <Link
                  key={termSlug}
                  href={`/terms/${termSlug}`}
                  className="inline-block bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                >
                  {termMap.get(termSlug) ?? termSlug.replace(/-/g, " ")}
                </Link>
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
