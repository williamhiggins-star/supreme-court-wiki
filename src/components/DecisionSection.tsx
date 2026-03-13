import Image from "next/image";
import type { CaseSummary } from "@/types";

// Canonical seniority order
const JUSTICE_ORDER = [
  "roberts", "thomas", "alito", "sotomayor", "kagan",
  "gorsuch", "kavanaugh", "barrett", "jackson",
] as const;

const JUSTICE_LABELS: Record<string, string> = {
  roberts: "Roberts",
  thomas: "Thomas",
  alito: "Alito",
  sotomayor: "Sotomayor",
  kagan: "Kagan",
  gorsuch: "Gorsuch",
  kavanaugh: "Kavanaugh",
  barrett: "Barrett",
  jackson: "Jackson",
};


function formatDecisionDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DecisionSection({ c }: { c: CaseSummary }) {
  const majorityAuthor = c.majorityAuthor;
  const concurrenceAuthors = c.concurrenceAuthors ?? [];
  const dissentAuthors = c.dissentAuthors ?? [];
  const isPerCuriam = majorityAuthor === "per_curiam";

  const dissentSet = new Set(dissentAuthors);
  const concurrenceSet = new Set(concurrenceAuthors);

  // ── Build ordered groups ──────────────────────────────────────────────────
  const winningSide: string[] = [];
  if (majorityAuthor && !isPerCuriam && !dissentSet.has(majorityAuthor)) {
    winningSide.push(majorityAuthor);
  }
  JUSTICE_ORDER.forEach((k) => {
    if (concurrenceSet.has(k) && k !== majorityAuthor && !dissentSet.has(k))
      winningSide.push(k);
  });
  JUSTICE_ORDER.forEach((k) => {
    if (!dissentSet.has(k) && k !== majorityAuthor && !concurrenceSet.has(k))
      winningSide.push(k);
  });

  const losingSide = JUSTICE_ORDER.filter((k) => dissentSet.has(k));

  type JusticeEntry = { key: string; ringColor: string; roleLabel: string | null; roleHref: string | null };

  function buildEntry(key: string): JusticeEntry {
    const isDissenter = dissentSet.has(key);
    const isMajorityAuthor = !isPerCuriam && majorityAuthor === key;
    const isConcurring = concurrenceSet.has(key);
    const ringColor = isDissenter ? "ring-[var(--rust)]" : "ring-[var(--forest)]";
    let roleLabel: string | null = null;
    let roleHref: string | null = null;
    if (isMajorityAuthor) { roleLabel = "Majority opinion"; roleHref = "#majority-opinion"; }
    else if (isConcurring) { roleLabel = "Concurring opinion"; roleHref = "#concurring-opinions"; }
    else if (isDissenter) { roleLabel = "Dissenting opinion"; roleHref = "#dissenting-opinions"; }
    return { key, ringColor, roleLabel, roleHref };
  }

  const winningEntries = winningSide.map(buildEntry);
  const losingEntries = losingSide.map(buildEntry);

  return (
    <div className="bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">

      {/* ── Justice circles ── */}
      {isPerCuriam && (
        <p
          className="text-[var(--warm-gray)] mb-4 text-center"
          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
        >
          Per Curiam
        </p>
      )}
      <div className="flex flex-wrap justify-center items-start gap-4 mb-6">
        {[...winningEntries, ...(losingEntries.length > 0 ? [null] : []), ...losingEntries].map((entry, i) => {
          // null is the divider
          if (entry === null) {
            return (
              <div key="divider" className="self-stretch flex items-center">
                <div className="w-px h-16 bg-[var(--tan)] mx-1" />
              </div>
            );
          }
          const { key, ringColor, roleLabel, roleHref } = entry;
          return (
            <div key={key} className="flex flex-col items-center gap-1 w-[68px]">
              <div className={`w-14 h-14 rounded-full overflow-hidden ring-[3px] ${ringColor}`}>
                <Image
                  src={`/images/justices/${key}.jpg`}
                  alt={JUSTICE_LABELS[key]}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <p
                className="text-center text-[var(--charcoal)] leading-tight"
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px" }}
              >
                {JUSTICE_LABELS[key]}
              </p>
              {roleLabel && roleHref ? (
                <a
                  href={roleHref}
                  className="text-center text-[var(--rust)] hover:underline leading-tight"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px" }}
                >
                  {roleLabel}
                </a>
              ) : (
                <span className="leading-tight invisible" style={{ fontSize: "10px" }}>·</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Decision date ── */}
      {c.decisionDate && (
        <p className="text-center text-[var(--warm-gray)] mb-6" style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
          Decided {formatDecisionDate(c.decisionDate)}
        </p>
      )}

      {/* ── Opinion summaries ── */}
      {c.majorityOpinionSummary && (
        <div id="majority-opinion" className="mb-6 scroll-mt-4">
          <h3
            className="text-[var(--charcoal)] mb-2"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            Majority Opinion
            {majorityAuthor && !isPerCuriam && (
              <span className="normal-case text-[var(--warm-gray)] ml-2" style={{ fontWeight: 400, letterSpacing: "0" }}>
                — Justice {capitalize(majorityAuthor)}
              </span>
            )}
          </h3>
          <div className="space-y-3">
            {c.majorityOpinionSummary.split("\n\n").map((para, i) => (
              <p key={i} className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {(c.concurringSummaries?.length ?? 0) > 0 && (
        <div id="concurring-opinions" className="mb-6 scroll-mt-4">
          <h3
            className="text-[var(--charcoal)] mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            Concurring Opinions
          </h3>
          <div className="space-y-5">
            {c.concurringSummaries!.map((s) => (
              <div key={s.author} className="pl-4 border-l-[3px] border-[var(--gold)]">
                <p
                  className="text-[var(--charcoal)] mb-1.5"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
                >
                  Justice {capitalize(s.author)}
                </p>
                <div className="space-y-2">
                  {s.summary.split("\n\n").map((para, i) => (
                    <p key={i} className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>{para}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(c.dissentSummaries?.length ?? 0) > 0 && (
        <div id="dissenting-opinions" className="scroll-mt-4">
          <h3
            className="text-[var(--charcoal)] mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            Dissenting Opinions
          </h3>
          <div className="space-y-5">
            {c.dissentSummaries!.map((s) => (
              <div key={s.author} className="pl-4 border-l-[3px] border-[var(--rust)]">
                <p
                  className="text-[var(--charcoal)] mb-1.5"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
                >
                  Justice {capitalize(s.author)}
                </p>
                <div className="space-y-2">
                  {s.summary.split("\n\n").map((para, i) => (
                    <p key={i} className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>{para}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder while summaries are pending */}
      {!c.majorityOpinionSummary && !(c.concurringSummaries?.length) && !(c.dissentSummaries?.length) && (
        <p className="text-[var(--warm-gray)] italic text-center pt-2" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
          Opinion summaries will appear after the next daily update.
        </p>
      )}
    </div>
  );
}
