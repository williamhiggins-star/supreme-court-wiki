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
    <div className="bg-[var(--ivory)] rounded-lg border border-[var(--tan)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">

      {/* ── Vote split dots ── */}
      {vote && (
        <div className="flex justify-center gap-2 mb-4">
          {Array.from({ length: vote.majority }).map((_, i) => (
            <div key={`m-${i}`} className="w-5 h-5 rounded-full bg-[var(--forest)] ring-[2px] ring-[var(--forest)]" />
          ))}
          {Array.from({ length: vote.dissent }).map((_, i) => (
            <div key={`d-${i}`} className="w-5 h-5 rounded-full bg-[var(--rust)] ring-[2px] ring-[var(--rust)]" />
          ))}
        </div>
      )}

      {/* ── Meta line ── */}
      <p className="text-center text-[var(--warm-gray)] mb-6" style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
        {[
          p.voteCount ? `${p.voteCount} decision` : null,
          p.majorityAuthor ? `Opinion by ${p.majorityAuthor}` : null,
          p.year ? String(p.year) : null,
        ].filter(Boolean).join(" · ")}
      </p>

      {/* ── Majority opinion ── */}
      {p.holding && (
        <div id="majority-opinion" className="mb-6 scroll-mt-4">
          <h3
            className="text-[var(--charcoal)] mb-2"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            Majority Opinion
            {p.majorityAuthor && (
              <span className="normal-case text-[var(--warm-gray)] ml-2" style={{ fontWeight: 400, letterSpacing: "0" }}>
                — {p.majorityAuthor}
              </span>
            )}
            {hasConcurrences && (
              <a href="#concurring-opinions" className="normal-case text-[var(--gold)] hover:underline ml-3" style={{ fontSize: "11px", fontWeight: 400 }}>
                concurring ↓
              </a>
            )}
            {hasDissents && (
              <a href="#dissenting-opinions" className="normal-case text-[var(--rust)] hover:underline ml-3" style={{ fontSize: "11px", fontWeight: 400 }}>
                dissent ↓
              </a>
            )}
          </h3>
          <div className="space-y-3">
            {p.holding.split("\n\n").map((para, i) => (
              <p key={i} className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {/* ── Concurring opinions ── */}
      {hasConcurrences && (
        <div id="concurring-opinions" className="mb-6 scroll-mt-4">
          <h3
            className="text-[var(--charcoal)] mb-2"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            Concurring Opinions
          </h3>
          <div className="pl-4 border-l-[3px] border-[var(--gold)]">
            <p className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>{p.concurringNote}</p>
          </div>
        </div>
      )}

      {/* ── Dissenting opinions ── */}
      {hasDissents && (
        <div id="dissenting-opinions" className="scroll-mt-4">
          <h3
            className="text-[var(--charcoal)] mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            Dissenting Opinions
          </h3>
          <div className="space-y-5">
            {p.dissentingOpinions!.map((d) => (
              <div key={d.author} className="pl-4 border-l-[3px] border-[var(--rust)]">
                <p
                  className="text-[var(--charcoal)] mb-1.5"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
                >
                  {d.author}
                  {d.joinedBy.length > 0 && (
                    <span className="text-[var(--warm-gray)] ml-1.5" style={{ fontWeight: 400 }}>
                      joined by {d.joinedBy.join(", ")}
                    </span>
                  )}
                </p>
                <p className="text-[var(--charcoal)] leading-relaxed mb-2" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>{d.coreArgument}</p>
                {d.keyPoints.length > 0 && (
                  <ul className="space-y-1 text-[var(--charcoal)] list-disc list-inside" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
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
