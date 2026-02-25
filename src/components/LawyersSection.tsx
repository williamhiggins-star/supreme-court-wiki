import type { LawyerStat } from "@/lib/lawyers";

// Show top N lawyers by speaking time
const TOP_N = 30;

interface Props {
  lawyers: LawyerStat[];
}

export function LawyersSection({ lawyers }: Props) {
  const visible = lawyers.slice(0, TOP_N);

  const maxMinutes = Math.max(...visible.map((l) => l.estimatedMinutes));
  const maxCases = Math.max(...visible.map((l) => l.casesArgued));

  const mid = Math.ceil(visible.length / 2);
  const leftCol = visible.slice(0, mid);
  const rightCol = visible.slice(mid);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-0">
      {[leftCol, rightCol].map((col, ci) => (
        <div key={ci} className="divide-y divide-gray-100">
          {col.map((l, i) => (
            <LawyerRow
              key={l.label}
              lawyer={l}
              rank={ci * mid + i + 1}
              maxMinutes={maxMinutes}
              maxCases={maxCases}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function LawyerRow({
  lawyer: l,
  rank,
  maxMinutes,
  maxCases,
}: {
  lawyer: LawyerStat;
  rank: number;
  maxMinutes: number;
  maxCases: number;
}) {
  const minutePct = (l.estimatedMinutes / maxMinutes) * 100;
  const casesPct = (l.casesArgued / maxCases) * 100;

  return (
    <div className="flex items-start gap-3 py-3">
      {/* Rank */}
      <span className="shrink-0 w-6 text-right text-xs text-gray-400 mt-0.5 font-medium">
        {rank}
      </span>

      {/* Name + bars */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 mb-1.5 leading-tight">
          {l.name}
        </p>

        {/* Speaking time bar */}
        <div className="mb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full bg-blue-500"
                style={{ width: `${minutePct}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 whitespace-nowrap w-16 text-right">
              {l.estimatedMinutes.toLocaleString()} min
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Speaking time</p>
        </div>

        {/* Cases argued bar */}
        <div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full bg-amber-400"
                style={{ width: `${casesPct}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 whitespace-nowrap w-16 text-right">
              {l.casesArgued} {l.casesArgued === 1 ? "case" : "cases"}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Cases argued</p>
        </div>
      </div>
    </div>
  );
}
