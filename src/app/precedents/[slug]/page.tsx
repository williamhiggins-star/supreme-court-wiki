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
    <main className="min-h-screen bg-[var(--cream)]">
      {/* Header */}
      <header className="bg-[var(--cream)] border-b border-[var(--tan)]">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link
            href="/precedents"
            className="text-[var(--warm-gray)] hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            &larr; Key Precedents
          </Link>
          <div className="mt-3">
            <h1
              className="text-2xl text-[var(--charcoal)]"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
            >
              {p.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }}>
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
            <p className="mt-3 text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
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
                    className="bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="text-[var(--charcoal)]"
                        style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "16px" }}
                      >
                        {party.party}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-[3px] capitalize border border-[var(--tan)] bg-[var(--cream)] text-[var(--warm-gray)]"
                        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
                      >
                        {party.role}
                      </span>
                    </div>
                    <p className="text-[var(--charcoal)] leading-relaxed mb-4" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
                      {party.coreArgument}
                    </p>
                    {party.supportingPoints.length > 0 && (
                      <ul className="space-y-1.5 text-[var(--charcoal)] list-disc list-inside" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
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
              <p className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>{p.summary}</p>
            </Section>
            <div
              className="bg-[var(--gold)]/10 border border-[var(--gold)]/30 rounded-lg px-5 py-4 text-[var(--charcoal)]"
              style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}
            >
              Full entry not yet generated. Run{" "}
              <code style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }} className="bg-[var(--gold)]/15 px-1 rounded">
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
                    className="block bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-5 hover:border-[var(--rust)] hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  >
                    <p
                      className="text-[var(--charcoal)]"
                      style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "16px" }}
                    >
                      {c.title}
                    </p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] mt-0.5">
                      {c.termYear} Term · {c.caseNumber}
                    </p>
                    <p className="text-[var(--charcoal)] mt-1.5 leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
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
                  className="bg-[var(--cream)] border border-[var(--tan)] text-[var(--charcoal)] px-3 py-1 rounded-[3px]"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
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
      <h2
        className="mb-4 pb-2 border-b border-[var(--tan)] text-[var(--charcoal)]"
        style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "20px" }}
      >
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
        <p key={i} className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
          {para}
        </p>
      ))}
    </div>
  );
}
