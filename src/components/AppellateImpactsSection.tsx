"use client";

import { useState } from "react";
import type { AppellateImpact } from "@/lib/appellate-impacts";

interface Props {
  impacts: AppellateImpact[];
  generated: string;
}

const AREA_COLOURS: Record<string, { bg: string; text: string; activeBg: string; activeText: string }> = {
  "Securities":            { bg: "bg-cyan-100",    text: "text-cyan-700",    activeBg: "bg-cyan-600",    activeText: "text-white" },
  "Antitrust":             { bg: "bg-red-100",     text: "text-red-700",     activeBg: "bg-red-600",     activeText: "text-white" },
  "Labor & Employment":    { bg: "bg-teal-100",    text: "text-teal-700",    activeBg: "bg-teal-600",    activeText: "text-white" },
  "Intellectual Property": { bg: "bg-violet-100",  text: "text-violet-700",  activeBg: "bg-violet-600",  activeText: "text-white" },
  "Arbitration":           { bg: "bg-blue-100",    text: "text-blue-700",    activeBg: "bg-blue-600",    activeText: "text-white" },
  "Class Actions":         { bg: "bg-orange-100",  text: "text-orange-700",  activeBg: "bg-orange-600",  activeText: "text-white" },
  "Bankruptcy":            { bg: "bg-amber-100",   text: "text-amber-700",   activeBg: "bg-amber-600",   activeText: "text-white" },
};

function areaChip(area: string) {
  const colour = AREA_COLOURS[area] ?? { bg: "bg-gray-100", text: "text-gray-600", activeBg: "bg-gray-600", activeText: "text-white" };
  return (
    <span className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${colour.bg} ${colour.text}`}>
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
  const [activeArea, setActiveArea] = useState<string | null>(null);

  if (impacts.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        No appellate impacts on file yet — run the daily update to populate.
      </p>
    );
  }

  // Sort: most recent first
  const sorted = [...impacts].sort((a, b) => b.date.localeCompare(a.date));

  // Only show categories that actually have results
  const presentAreas = Array.from(new Set(sorted.map((i) => i.area)));

  const filtered = activeArea ? sorted.filter((i) => i.area === activeArea) : sorted;

  return (
    <div>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveArea(null)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            activeArea === null
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"
          }`}
        >
          All
        </button>
        {presentAreas.map((area) => {
          const colour = AREA_COLOURS[area] ?? { bg: "bg-gray-100", text: "text-gray-600", activeBg: "bg-gray-600", activeText: "text-white" };
          const isActive = activeArea === area;
          return (
            <button
              key={area}
              onClick={() => setActiveArea(isActive ? null : area)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                isActive
                  ? `${colour.activeBg} ${colour.activeText} border-transparent`
                  : `${colour.bg} ${colour.text} border-transparent hover:opacity-80`
              }`}
            >
              {area}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No results for this category.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filtered.map((imp) => (
            <ImpactCard key={imp.id} impact={imp} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400 text-right">
        Last updated {generated} · Source: CourtListener · Analysis: Claude AI
      </p>
    </div>
  );
}
