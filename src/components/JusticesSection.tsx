import Image from "next/image";
import type { JusticeStat } from "@/lib/justices";

interface Props {
  justices: JusticeStat[];
}

export function JusticesSection({ justices }: Props) {
  const maxMinutes = Math.max(...justices.map((j) => j.estimatedMinutes));
  const maxQuestions = Math.max(...justices.map((j) => j.questions));
  const maxOpinions = Math.max(
    ...justices.map((j) => j.majorityOpinions + j.concurrences + j.dissents)
  );

  const mid = Math.ceil(justices.length / 2);
  const leftCol = justices.slice(0, mid);
  const rightCol = justices.slice(mid);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-0">
      {[leftCol, rightCol].map((col, ci) => (
        <div key={ci} className="divide-y divide-[var(--tan)]/30">
          {col.map((j) => (
            <JusticeRow
              key={j.key}
              justice={j}
              maxMinutes={maxMinutes}
              maxQuestions={maxQuestions}
              maxOpinions={maxOpinions}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function JusticeRow({
  justice: j,
  maxMinutes,
  maxQuestions,
  maxOpinions,
}: {
  justice: JusticeStat;
  maxMinutes: number;
  maxQuestions: number;
  maxOpinions: number;
}) {
  const minutePct = (j.estimatedMinutes / maxMinutes) * 100;
  const questionPct = (j.questions / maxQuestions) * 100;

  const totalOpinions = j.majorityOpinions + j.concurrences + j.dissents;
  const opinionBarPct = maxOpinions > 0 ? (totalOpinions / maxOpinions) * 100 : 0;
  // Segment widths within the opinion bar (as % of the filled portion)
  const majPct  = totalOpinions > 0 ? (j.majorityOpinions / totalOpinions) * 100 : 0;
  const concPct = totalOpinions > 0 ? (j.concurrences     / totalOpinions) * 100 : 0;
  const disPct  = totalOpinions > 0 ? (j.dissents         / totalOpinions) * 100 : 0;

  return (
    <div className="flex items-start gap-3 py-4">
      {/* Photo */}
      <div className="shrink-0">
        <Image
          src={j.photo}
          alt={j.displayName}
          width={56}
          height={56}
          className="rounded object-cover object-top grayscale"
          style={{ width: 56, height: 56 }}
        />
      </div>

      {/* Name + bars */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[var(--charcoal)] mb-2 leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "14px" }}
        >
          {j.displayName}
        </p>

        {/* Speaking time bar */}
        <div className="mb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--tan)]/20 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full bg-[var(--rust)]" style={{ width: `${minutePct}%` }} />
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] whitespace-nowrap w-16 text-right">
              {j.estimatedMinutes.toLocaleString()} min
            </span>
          </div>
          <p className="text-[var(--warm-gray)] mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Speaking time</p>
        </div>

        {/* Speaking turns bar */}
        <div className="mb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--tan)]/20 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full bg-[var(--gold)]" style={{ width: `${questionPct}%` }} />
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] whitespace-nowrap w-16 text-right">
              {j.questions.toLocaleString()} turns
            </span>
          </div>
          <p className="text-[var(--warm-gray)] mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Speaking turns</p>
        </div>

        {/* Opinions stacked bar */}
        <div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--tan)]/20 rounded-full h-3 overflow-hidden">
              {totalOpinions > 0 ? (
                <div
                  className="h-3 flex overflow-hidden rounded-full"
                  style={{ width: `${opinionBarPct}%` }}
                >
                  {j.majorityOpinions > 0 && (
                    <div className="h-full bg-[var(--forest)]" style={{ width: `${majPct}%` }} />
                  )}
                  {j.concurrences > 0 && (
                    <div className="h-full bg-[var(--gold)]" style={{ width: `${concPct}%` }} />
                  )}
                  {j.dissents > 0 && (
                    <div className="h-full bg-[var(--rust)]" style={{ width: `${disPct}%` }} />
                  )}
                </div>
              ) : null}
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] whitespace-nowrap w-16 text-right">
              {totalOpinions} opinion{totalOpinions !== 1 ? "s" : ""}
            </span>
          </div>
          {/* Segment legend */}
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              <span className="inline-block w-2 h-2 rounded-sm bg-[var(--forest)]" />
              {j.majorityOpinions} majority
            </span>
            <span className="flex items-center gap-1 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              <span className="inline-block w-2 h-2 rounded-sm bg-[var(--gold)]" />
              {j.concurrences} concurring
            </span>
            <span className="flex items-center gap-1 text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
              <span className="inline-block w-2 h-2 rounded-sm bg-[var(--rust)]" />
              {j.dissents} dissenting
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
