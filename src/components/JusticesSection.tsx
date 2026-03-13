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
        <div key={ci} className="divide-y divide-gray-100">
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
        <p className="text-sm font-bold text-gray-900 mb-2 leading-tight">
          {j.displayName}
        </p>

        {/* Speaking time bar */}
        <div className="mb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full bg-blue-500" style={{ width: `${minutePct}%` }} />
            </div>
            <span className="text-[11px] text-gray-500 whitespace-nowrap w-16 text-right">
              {j.estimatedMinutes.toLocaleString()} min
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Speaking time</p>
        </div>

        {/* Speaking turns bar */}
        <div className="mb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full bg-amber-400" style={{ width: `${questionPct}%` }} />
            </div>
            <span className="text-[11px] text-gray-500 whitespace-nowrap w-16 text-right">
              {j.questions.toLocaleString()} turns
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Speaking turns</p>
        </div>

        {/* Opinions stacked bar */}
        <div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              {totalOpinions > 0 ? (
                <div
                  className="h-3 flex overflow-hidden rounded-full"
                  style={{ width: `${opinionBarPct}%` }}
                >
                  {j.majorityOpinions > 0 && (
                    <div className="h-full bg-indigo-500" style={{ width: `${majPct}%` }} />
                  )}
                  {j.concurrences > 0 && (
                    <div className="h-full bg-emerald-400" style={{ width: `${concPct}%` }} />
                  )}
                  {j.dissents > 0 && (
                    <div className="h-full bg-rose-400" style={{ width: `${disPct}%` }} />
                  )}
                </div>
              ) : null}
            </div>
            <span className="text-[11px] text-gray-500 whitespace-nowrap w-16 text-right">
              {totalOpinions} opinion{totalOpinions !== 1 ? "s" : ""}
            </span>
          </div>
          {/* Segment legend */}
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500" />
              {j.majorityOpinions} majority
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400" />
              {j.concurrences} concurring
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="inline-block w-2 h-2 rounded-sm bg-rose-400" />
              {j.dissents} dissenting
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
