import Image from "next/image";
import type { JusticeStat } from "@/lib/justices";

interface Props {
  justices: JusticeStat[];
}

export function JusticesSection({ justices }: Props) {
  // Scale bars to the maximum value across all justices
  const maxMinutes = Math.max(...justices.map((j) => j.estimatedMinutes));
  const maxQuestions = Math.max(...justices.map((j) => j.questions));

  // Split into two columns: left gets ceil(n/2), right gets floor(n/2)
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
}: {
  justice: JusticeStat;
  maxMinutes: number;
  maxQuestions: number;
}) {
  const minutePct = (j.estimatedMinutes / maxMinutes) * 100;
  const questionPct = (j.questions / maxQuestions) * 100;

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
              <div
                className="h-3 rounded-full bg-blue-500"
                style={{ width: `${minutePct}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 whitespace-nowrap w-16 text-right">
              {j.estimatedMinutes.toLocaleString()} min
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Speaking time</p>
        </div>

        {/* Questions bar */}
        <div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full bg-amber-400"
                style={{ width: `${questionPct}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 whitespace-nowrap w-16 text-right">
              {j.questions.toLocaleString()} turns
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Speaking turns</p>
        </div>
      </div>
    </div>
  );
}
