"use client";

import { useState } from "react";
import type { AppellateImpact } from "@/lib/appellate-impacts";

interface Props {
  impacts: AppellateImpact[];
  generated: string;
}

function areaChip(area: string) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-[3px] border border-[var(--tan)] bg-[var(--cream)] text-[var(--warm-gray)]"
      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}
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
      className="inline-block px-2 py-0.5 rounded-[3px] bg-[var(--charcoal)] text-[var(--cream)] hover:bg-[var(--warm-gray)] transition-colors"
      style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500, fontSize: "11px" }}
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
    <div className="bg-[var(--ivory)] border border-[var(--tan)] rounded-lg overflow-hidden hover:border-[var(--rust)] hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--tan)]/30">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          {areaChip(impact.area)}
          {courtBadge(impact.court, impact.url)}
          <span className="ml-auto text-[var(--warm-gray)] shrink-0" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
            {formatDate(impact.date)}
          </span>
        </div>

        <a
          href={impact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[var(--charcoal)] leading-snug hover:text-[var(--rust)] transition-colors mb-1"
          style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "15px" }}
        >
          {impact.caseName}
        </a>
        {impact.docketNumber && (
          <p className="text-[var(--warm-gray)] mb-2" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>{impact.docketNumber}</p>
        )}

        <p className="text-[var(--charcoal)] leading-snug mb-1.5 italic" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px", fontWeight: 500 }}>
          {impact.legalQuestion}
        </p>
        <p className="text-[var(--warm-gray)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "13px" }}>
          {impact.description}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-[var(--tan)]/30">
        <div className="flex-1 border-t-2 border-[var(--forest)] pt-3 px-4 pb-4">
          <p
            className="mb-1 text-[var(--forest)]"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Favorable to Business
          </p>
          <p className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "13px" }}>
            {impact.positiveImplications}
          </p>
        </div>
        <div className="flex-1 border-t-2 border-[var(--rust)] pt-3 px-4 pb-4">
          <p
            className="mb-1 text-[var(--rust)]"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Risk for Business
          </p>
          <p className="text-[var(--charcoal)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "13px" }}>
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
      <p className="text-[var(--warm-gray)] italic" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
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
          className={`px-3 py-1.5 rounded-[3px] border transition-colors ${
            activeArea === null
              ? "bg-[var(--charcoal)] text-[var(--cream)] border-[var(--charcoal)]"
              : "bg-[var(--ivory)] text-[var(--warm-gray)] border-[var(--tan)] hover:border-[var(--rust)]"
          }`}
          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
        >
          All
        </button>
        {presentAreas.map((area) => {
          const isActive = activeArea === area;
          return (
            <button
              key={area}
              onClick={() => setActiveArea(isActive ? null : area)}
              className={`px-3 py-1.5 rounded-[3px] border transition-colors ${
                isActive
                  ? "bg-[var(--charcoal)] text-[var(--cream)] border-[var(--charcoal)]"
                  : "bg-[var(--ivory)] text-[var(--warm-gray)] border-[var(--tan)] hover:border-[var(--rust)]"
              }`}
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px" }}
            >
              {area}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <p className="text-[var(--warm-gray)] italic" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>No results for this category.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filtered.map((imp) => (
            <ImpactCard key={imp.id} impact={imp} />
          ))}
        </div>
      )}

      <p className="mt-6 text-right text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
        Last updated {generated} · Source: CourtListener · Analysis: Claude AI
      </p>
    </div>
  );
}
