import Link from "next/link";
import type { CircuitSplit, CircuitPosition, CircuitCaseRef } from "@/lib/circuit-splits";

interface Props {
  splits: CircuitSplit[];
  generated: string;
}

// Area → accent colour mapping
const AREA_COLOURS: Record<string, { bg: string; text: string }> = {
  "Criminal Law":        { bg: "bg-red-100",    text: "text-red-700"    },
  "Fourth Amendment":    { bg: "bg-purple-100",  text: "text-purple-700" },
  "Immigration":         { bg: "bg-amber-100",   text: "text-amber-700"  },
  "Administrative Law":  { bg: "bg-blue-100",    text: "text-blue-700"   },
  "Employment":          { bg: "bg-teal-100",    text: "text-teal-700"   },
  "Bankruptcy":          { bg: "bg-orange-100",  text: "text-orange-700" },
  "Civil Rights":        { bg: "bg-pink-100",    text: "text-pink-700"   },
  "First Amendment":     { bg: "bg-indigo-100",  text: "text-indigo-700" },
  "Securities":          { bg: "bg-cyan-100",    text: "text-cyan-700"   },
};

function areaChip(area: string) {
  const colour = AREA_COLOURS[area] ?? { bg: "bg-gray-100", text: "text-gray-600" };
  return (
    <span className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${colour.bg} ${colour.text}`}>
      {area}
    </span>
  );
}

function statusBadge(split: CircuitSplit) {
  if (split.status === "scotus_pending")
    return (
      <Link
        href={split.relatedScotusSlug ? `/cases/${split.relatedScotusSlug}` : "#"}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-ft-pink text-gray-800 hover:bg-[#f5c4a0] transition-colors"
        title="SCOTUS cert granted"
      >
        ★ SCOTUS pending
      </Link>
    );
  if (split.status === "scotus_resolved")
    return (
      <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
        ✓ Resolved by SCOTUS
      </span>
    );
  return null;
}

function CircuitBadge({ c }: { c: CircuitCaseRef }) {
  return (
    <a
      href={c.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${c.name} — ${c.caseName}${c.citation ? ` (${c.citation})` : ""}, ${c.year}`}
      className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-gray-800 text-white hover:bg-gray-600 transition-colors"
    >
      {c.shortName}
    </a>
  );
}

function PositionColumn({ pos, index }: { pos: CircuitPosition; index: number }) {
  const borderColour = index === 0 ? "border-emerald-400" : "border-rose-400";
  const labelColour  = index === 0 ? "text-emerald-700"   : "text-rose-700";
  const dotColour    = index === 0 ? "bg-emerald-400"     : "bg-rose-400";

  return (
    <div className={`flex-1 border-t-2 ${borderColour} pt-3 px-4 pb-4`}>
      <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${labelColour}`}>
        {pos.label}
      </p>
      <p className="text-xs text-gray-600 leading-relaxed mb-3">
        {pos.summary}
      </p>

      {/* Circuit badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {pos.circuits.map((c) => (
          <CircuitBadge key={`${c.key}-${c.caseName}`} c={c} />
        ))}
      </div>

      {/* Key cases */}
      <div className="space-y-1.5">
        {pos.circuits.map((c) => (
          <div key={`${c.key}-link-${c.caseName}`} className="flex items-start gap-1.5 text-xs text-gray-500 leading-snug">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dotColour}`} />
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-700 hover:underline"
            >
              {c.caseName}
              {c.citation ? `, ${c.citation}` : ""}
              {" "}({c.year})
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitCard({ split }: { split: CircuitSplit }) {
  const totalCircuits = split.positions.reduce((n, p) => n + p.circuits.length, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          {areaChip(split.area)}
          {statusBadge(split)}
          <span className="ml-auto text-[11px] text-gray-400">
            {totalCircuits} circuit{totalCircuits !== 1 ? "s" : ""}
          </span>
        </div>

        <p className="text-sm font-semibold text-gray-900 leading-snug mb-1.5">
          {split.legalQuestion}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
          {split.description}
        </p>
      </div>

      {/* Positions */}
      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        {split.positions.map((pos, i) => (
          <PositionColumn key={pos.label} pos={pos} index={i} />
        ))}
      </div>
    </div>
  );
}

export function CircuitSplitsSection({ splits, generated }: Props) {
  if (splits.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        No circuit splits on file yet — run the daily update to populate.
      </p>
    );
  }

  // Group by status: SCOTUS-pending first, then open, then resolved
  const order = { scotus_pending: 0, open: 1, scotus_resolved: 2 };
  const sorted = [...splits].sort(
    (a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1),
  );

  return (
    <div>
      <div className="grid grid-cols-1 gap-5">
        {sorted.map((s) => (
          <SplitCard key={s.id} split={s} />
        ))}
      </div>
      <p className="mt-6 text-xs text-gray-400 text-right">
        Last updated {generated} · Source: CourtListener · Analysis: Claude AI
      </p>
    </div>
  );
}
