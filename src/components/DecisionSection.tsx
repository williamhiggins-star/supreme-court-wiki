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

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">

      {/* ── Justice circles ── */}
      {isPerCuriam && (
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 text-center">
          Per Curiam
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-4 mb-6">
        {JUSTICE_ORDER.map((key) => {
          const isDissenter = dissentAuthors.includes(key);
          const isMajorityAuthor = !isPerCuriam && majorityAuthor === key;
          const isConcurring = concurrenceAuthors.includes(key);

          const ringColor = isDissenter ? "ring-rose-500" : "ring-emerald-500";

          let roleLabel: string | null = null;
          let roleHref: string | null = null;
          if (isMajorityAuthor) {
            roleLabel = "Majority opinion";
            roleHref = "#majority-opinion";
          } else if (isConcurring) {
            roleLabel = "Concurring opinion";
            roleHref = "#concurring-opinions";
          } else if (isDissenter) {
            roleLabel = "Dissenting opinion";
            roleHref = "#dissenting-opinions";
          }

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

      {/* ── Decision outcome badge ── */}
      {c.petitionerWon !== null && c.petitionerWon !== undefined && (
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
              c.petitionerWon
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800"
            }`}
          >
            {c.petitionerWon ? "Petitioner prevailed" : "Respondent prevailed"}
          </span>
          {c.decisionDate && (
            <span className="text-sm text-gray-400">
              {formatDecisionDate(c.decisionDate)}
            </span>
          )}
        </div>
      )}

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
