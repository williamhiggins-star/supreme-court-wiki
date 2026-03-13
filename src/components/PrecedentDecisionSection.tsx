import type { PrecedentCase } from "@/types";

function parseVoteCount(voteCount?: string): { majority: number; dissent: number } | null {
  if (!voteCount) return null;
  const match = /(\d+)\s*[–\-]\s*(\d+)/.exec(voteCount);
  if (!match) return null;
  return { majority: parseInt(match[1]), dissent: parseInt(match[2]) };
}

export function PrecedentDecisionSection({ p }: { p: PrecedentCase }) {
  const vote = parseVoteCount(p.voteCount);
  const hasConcurrences = !!p.concurringNote;
  const hasDissents = (p.dissentingOpinions?.length ?? 0) > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">

      {/* ── Vote split dots ── */}
      {vote && (
        <div className="flex justify-center gap-2 mb-4">
          {Array.from({ length: vote.majority }).map((_, i) => (
            <div key={`m-${i}`} className="w-5 h-5 rounded-full bg-emerald-500 ring-[2px] ring-emerald-600" />
          ))}
          {Array.from({ length: vote.dissent }).map((_, i) => (
            <div key={`d-${i}`} className="w-5 h-5 rounded-full bg-rose-500 ring-[2px] ring-rose-600" />
          ))}
        </div>
      )}

      {/* ── Meta line ── */}
      <p className="text-sm text-gray-400 text-center mb-6">
        {[
          p.voteCount ? `${p.voteCount} decision` : null,
          p.majorityAuthor ? `Opinion by ${p.majorityAuthor}` : null,
          p.year ? String(p.year) : null,
        ].filter(Boolean).join(" · ")}
      </p>

      {/* ── Majority opinion ── */}
      {p.holding && (
        <div id="majority-opinion" className="mb-6 scroll-mt-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
            Majority Opinion
            {p.majorityAuthor && (
              <span className="normal-case font-normal text-gray-500 ml-2">
                — {p.majorityAuthor}
              </span>
            )}
            {hasConcurrences && (
              <a href="#concurring-opinions" className="normal-case font-normal text-blue-500 hover:underline text-xs ml-3">
                concurring ↓
              </a>
            )}
            {hasDissents && (
              <a href="#dissenting-opinions" className="normal-case font-normal text-rose-500 hover:underline text-xs ml-3">
                dissent ↓
              </a>
            )}
          </h3>
          <div className="space-y-3">
            {p.holding.split("\n\n").map((para, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{para}</p>
            ))}
          </div>
        </div>
      )}

      {/* ── Concurring opinions ── */}
      {hasConcurrences && (
        <div id="concurring-opinions" className="mb-6 scroll-mt-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
            Concurring Opinions
          </h3>
          <div className="pl-4 border-l-2 border-blue-200">
            <p className="text-sm text-gray-700 leading-relaxed">{p.concurringNote}</p>
          </div>
        </div>
      )}

      {/* ── Dissenting opinions ── */}
      {hasDissents && (
        <div id="dissenting-opinions" className="scroll-mt-4">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            Dissenting Opinions
          </h3>
          <div className="space-y-5">
            {p.dissentingOpinions!.map((d) => (
              <div key={d.author} className="pl-4 border-l-2 border-rose-300">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">
                  {d.author}
                  {d.joinedBy.length > 0 && (
                    <span className="font-normal text-gray-400 ml-1.5">
                      joined by {d.joinedBy.join(", ")}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">{d.coreArgument}</p>
                {d.keyPoints.length > 0 && (
                  <ul className="space-y-1 text-sm text-gray-600 list-disc list-inside">
                    {d.keyPoints.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
