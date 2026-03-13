import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaseBySlug, getAllCases, getAllTerms } from "@/lib/data";
import { DecisionSection } from "@/components/DecisionSection";
import { getArticlesForCase } from "@/lib/articles";
import { getCircuitSplitForCase } from "@/lib/circuit-splits";
import { SplitCardEmbed } from "@/components/CircuitSplitsSection";
import type { Article } from "@/types";

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

  const articles = c.termYear === "2025" ? getArticlesForCase(c.slug) : [];
  const circuitSplit = getCircuitSplitForCase(c.slug);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <header className="bg-[var(--cream)] border-b border-[var(--tan)]">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link
            href="/"
            className="text-[var(--warm-gray)] hover:text-[var(--rust)] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            &larr; All Cases
          </Link>
          <div className="mt-3">
            <span
              className="text-[var(--warm-gray)]"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              {c.termYear} Term · {c.caseNumber}
            </span>
            <h1
              className="mt-1 text-2xl text-[var(--charcoal)]"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}
            >
              {c.title}
            </h1>
            <p className="mt-2 text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "15px" }}>
              {c.legalQuestion}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-4" style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }}>
            {c.docketStatus === "upcoming" ? (
              <span className="text-[var(--rust)]" style={{ fontWeight: 500 }}>
                Oral argument scheduled for {formatDate(c.argumentDate)} at 10:00 a.m. ET
              </span>
            ) : (
              <>
                <span className="text-[var(--warm-gray)]">Argued {formatDate(c.argumentDate)}</span>
                {c.transcriptUrl && (
                  <a
                    href={c.transcriptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--rust)] hover:underline"
                  >
                    Official Transcript
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Decision — only for decided cases with author data */}
        {c.docketStatus === "decided" && (c.majorityAuthor || c.majorityOpinionSummary) && (
          <Section title="The Decision">
            <DecisionSection c={c} />
          </Section>
        )}

        {/* Spotify oral argument recording */}
        {c.podcastEpisodeUrl && (() => {
          const m = c.podcastEpisodeUrl.match(/episode\/([A-Za-z0-9]+)/);
          if (!m) return null;
          const embedUrl = `https://open.spotify.com/embed/episode/${m[1]}?utm_source=generator`;
          return (
            <Section title="Oral Argument Recording">
              <iframe
                style={{ borderRadius: "12px" }}
                src={embedUrl}
                width="100%"
                height="152"
                frameBorder="0"
                allowFullScreen
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
              <p className="mt-2 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                Via{" "}
                <a href={c.podcastEpisodeUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--forest)] hover:underline">
                  Spotify
                </a>
              </p>
            </Section>
          );
        })()}

        {/* Background */}
        <Section title="Background & Facts">
          <Prose text={c.backgroundAndFacts} />
        </Section>

        {/* Why it matters */}
        <Section title="Why This Case Matters">
          <Prose text={c.significance} />
        </Section>

        {/* Circuit split — shown when this case resolves an active split */}
        {circuitSplit && (
          <Section title="The Circuit Split">
            <SplitCardEmbed split={circuitSplit} />
          </Section>
        )}

        {/* Parties */}
        <Section title="The Arguments">
          {c.docketStatus === "upcoming" && (
            <div className="mb-6 bg-[var(--rust)]/10 border border-[var(--rust)]/30 rounded-lg px-5 py-4 text-[var(--charcoal)]" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
              Oral argument is scheduled for {formatDate(c.argumentDate)} at 10:00 a.m. ET.
              The positions below reflect each party&rsquo;s written briefs. This section will be updated following argument.
            </div>
          )}
          <div className="space-y-8">
            {c.parties.map((party) => (
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
                {party.keyExchanges.length > 0 && (
                  <div className="mt-5 space-y-4">
                    <h4
                      className="text-[var(--warm-gray)]"
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
                    >
                      Key Exchanges with Justices
                    </h4>
                    {party.keyExchanges.map((ex, i) => (
                      <div key={i} className="pl-4 border-l-[3px] border-[var(--rust)]">
                        <p
                          className="text-[var(--charcoal)]"
                          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px" }}
                        >
                          {ex.justice}
                        </p>
                        <p className="text-[var(--charcoal)] mt-0.5 italic" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
                          &ldquo;{ex.question}&rdquo;
                        </p>
                        <p className="text-[var(--warm-gray)] mt-1" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
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
                  className="block bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-5 hover:border-[var(--rust)] hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className="text-[var(--charcoal)]"
                        style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "16px" }}
                      >
                        {p.caseName}
                      </p>
                      {p.citation && (
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] mt-0.5">
                          {p.citation}
                        </p>
                      )}
                      <p className="text-[var(--charcoal)] mt-1.5 leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
                        {p.reasonCited}
                      </p>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-[3px] capitalize whitespace-nowrap border border-[var(--tan)] bg-[var(--cream)] text-[var(--warm-gray)]"
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
                    >
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
                  className="inline-block bg-[var(--forest)]/10 text-[var(--forest)] px-3 py-1.5 rounded-[3px] border border-[var(--forest)]/30 hover:bg-[var(--forest)]/20 transition-colors"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
                >
                  {termMap.get(termSlug) ?? termSlug.replace(/-/g, " ")}
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* Analysis & Opinions */}
        {articles.length > 0 && (
          <Section title="Analysis &amp; Opinions">
            <div className="space-y-4">
              {articles.map((article) => (
                <CaseArticleEntry key={article.id} article={article} />
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

function CaseArticleEntry({ article }: { article: Article }) {
  return (
    <div className="bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-5 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
        <span
          className="bg-[var(--cream)] px-2 py-0.5 rounded-[3px] border border-[var(--tan)] text-[var(--charcoal)]"
          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
        >
          {article.source}
        </span>
        {article.author && <span className="text-[var(--warm-gray)]">{article.author}</span>}
        <span className="text-[var(--warm-gray)]">{article.publishedAt}</span>
      </div>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[var(--charcoal)] hover:text-[var(--rust)] leading-snug transition-colors"
        style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "16px" }}
      >
        {article.title}
      </a>
      <p className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>{article.summary}</p>
    </div>
  );
}
