import type { AppellateImpact } from "@/lib/appellate-impacts";

interface Props {
  impacts: AppellateImpact[];
  generated: string;
}

// Area → accent colour (same pattern as CircuitSplitsSection)
const AREA_COLOURS: Record<string, { bg: string; text: string }> = {
  "Securities":            { bg: "bg-cyan-100",    text: "text-cyan-700"    },
  "Antitrust":             { bg: "bg-red-100",     text: "text-red-700"     },
  "Labor & Employment":    { bg: "bg-teal-100",    text: "text-teal-700"    },
  "Intellectual Property": { bg: "bg-violet-100",  text: "text-violet-700"  },
  "Arbitration":           { bg: "bg-blue-100",    text: "text-blue-700"    },
  "Class Actions":         { bg: "bg-orange-100",  text: "text-orange-700"  },
  "Bankruptcy":            { bg: "bg-amber-100",   text: "text-amber-700"   },
};

function areaChip(area: string) {
  const colour = AREA_COLOURS[area] ?? { bg: "bg-gray-100", text: "text-gray-600" };
  return (
    <span
      className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${colour.bg} ${colour.text}`}
    >
      {area}
    </span>
  );
}

function courtBadge(court: string, url: string) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="View full opinion on CourtListener"
      className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-gray-800 text-white hover:bg-gray-600 transition-colors"
    >
      {court}
    </a>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ImpactCard({ impact }: { impact: AppellateImpact }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          {areaChip(impact.area)}
          {courtBadge(impact.court, impact.url)}
          <span className="ml-auto text-[11px] text-gray-400 shrink-0">
            {formatDate(impact.date)}
          </span>
        </div>

        <a
          href={impact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm font-semibold text-gray-900 leading-snug hover:text-blue-700 mb-1"
        >
          {impact.caseName}
        </a>
        {impact.docketNumber && (
          <p className="text-[11px] text-gray-400 mb-2">{impact.docketNumber}</p>
        )}

        <p className="text-xs font-medium text-gray-700 leading-snug mb-1.5 italic">
          {impact.legalQuestion}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
          {impact.description}
        </p>
      </div>

      {/* Implications — two columns mirroring the circuit splits positions layout */}
      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <div className="flex-1 border-t-2 border-emerald-400 pt-3 px-4 pb-4">
          <p className="text-xs font-bold uppercase tracking-wide mb-1 text-emerald-700">
            Favorable to Business
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            {impact.positiveImplications}
          </p>
        </div>
        <div className="flex-1 border-t-2 border-rose-400 pt-3 px-4 pb-4">
          <p className="text-xs font-bold uppercase tracking-wide mb-1 text-rose-700">
            Risk for Business
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            {impact.negativeImplications}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppellateImpactsSection({ impacts, generated }: Props) {
  if (impacts.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        No appellate impacts on file yet — run the daily update to populate.
      </p>
    );
  }

  // Sort: most recent first
  const sorted = [...impacts].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <div className="grid grid-cols-1 gap-5">
        {sorted.map((imp) => (
          <ImpactCard key={imp.id} impact={imp} />
        ))}
      </div>
      <p className="mt-6 text-xs text-gray-400 text-right">
        Last updated {generated} · Source: CourtListener · Analysis: Claude AI
      </p>
    </div>
  );
}
