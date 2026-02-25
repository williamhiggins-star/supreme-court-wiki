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
  // Winning side:
  //   1. Majority opinion author (first, unless per curiam)
  //   2. Concurring opinion authors, by seniority
  //   3. All remaining majority justices, by seniority
  const winningSide: string[] = [];
  if (majorityAuthor && !isPerCuriam && !dissentSet.has(majorityAuthor)) {
    winningSide.push(majorityAuthor);
  }
  // JUSTICE_ORDER is already in seniority order, so filtering preserves seniority
  JUSTICE_ORDER.forEach((k) => {
    if (concurrenceSet.has(k) && k !== majorityAuthor && !dissentSet.has(k))
      winningSide.push(k);
  });
  JUSTICE_ORDER.forEach((k) => {
    if (!dissentSet.has(k) && k !== majorityAuthor && !concurrenceSet.has(k))
      winningSide.push(k);
  });

  // Losing side: dissenting opinion authors, by seniority
  const losingSide = JUSTICE_ORDER.filter((k) => dissentSet.has(k));

  type JusticeEntry = { key: string; ringColor: string; roleLabel: string | null; roleHref: string | null };

  function buildEntry(key: string): JusticeEntry {
    const isDissenter = dissentSet.has(key);
    const isMajorityAuthor = !isPerCuriam && majorityAuthor === key;
    const isConcurring = concurrenceSet.has(key);
    const ringColor = isDissenter ? "ring-rose-500" : "ring-emerald-500";
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
    <div className="bg-white rounded-lg border border-gray-200 p-6">

      {/* ── Justice circles ── */}
      {isPerCuriam && (
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 text-center">
          Per Curiam
        </p>
      )}
      <div className="flex flex-wrap justify-center items-start gap-4 mb-6">
        {[...winningEntries, ...(losingEntries.length > 0 ? [null] : []), ...losingEntries].map((entry, i) => {
          // null is the divider
          if (entry === null) {
            return (
              <div key="divider" className="self-stretch flex items-center">
                <div className="w-px h-16 bg-gray-200 mx-1" />
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
              <p className="text-[10px] text-center text-gray-600 leading-tight font-medium">
                {JUSTICE_LABELS[key]}
              </p>
              {roleLabel && roleHref ? (
                <a
                  href={roleHref}
                  className="text-[10px] text-center text-blue-600 hover:underline leading-tight"
                >
                  {roleLabel}
                </a>
              ) : (
                <span className="text-[10px] leading-tight invisible">·</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Opinion summaries ── */}
      {c.majorityOpinionSummary && (
        <div id="majority-opinion" className="mb-6 scroll-mt-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
            Majority Opinion
            {majorityAuthor && !isPerCuriam && (
              <span className="normal-case font-normal text-gray-500 ml-2">
                — Justice {capitalize(majorityAuthor)}
              </span>
            )}
          </h3>
          <div className="space-y-3">
            {c.majorityOpinionSummary.split("\n\n").map((para, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{para}</p>
            ))}
          </div>
        </div>
      )}

      {(c.concurringSummaries?.length ?? 0) > 0 && (
        <div id="concurring-opinions" className="mb-6 scroll-mt-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            Concurring Opinions
          </h3>
          <div className="space-y-5">
            {c.concurringSummaries!.map((s) => (
              <div key={s.author} className="pl-4 border-l-2 border-blue-200">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">
                  Justice {capitalize(s.author)}
                </p>
                <div className="space-y-2">
                  {s.summary.split("\n\n").map((para, i) => (
                    <p key={i} className="text-sm text-gray-700 leading-relaxed">{para}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(c.dissentSummaries?.length ?? 0) > 0 && (
        <div id="dissenting-opinions" className="scroll-mt-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            Dissenting Opinions
          </h3>
          <div className="space-y-5">
            {c.dissentSummaries!.map((s) => (
              <div key={s.author} className="pl-4 border-l-2 border-rose-300">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">
                  Justice {capitalize(s.author)}
                </p>
                <div className="space-y-2">
                  {s.summary.split("\n\n").map((para, i) => (
                    <p key={i} className="text-sm text-gray-700 leading-relaxed">{para}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder while summaries are pending */}
      {!c.majorityOpinionSummary && !(c.concurringSummaries?.length) && !(c.dissentSummaries?.length) && (
        <p className="text-sm text-gray-400 italic text-center pt-2">
          Opinion summaries will appear after the next daily update.
        </p>
      )}
    </div>
  );
}
