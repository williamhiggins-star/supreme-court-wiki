"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { LawyerStat } from "@/lib/lawyers";

const TOP_N = 30;

interface Props {
  lawyers: LawyerStat[];
}

export function LawyersSection({ lawyers }: Props) {
  const visible = lawyers.slice(0, TOP_N);

  const maxMinutes = Math.max(...visible.map((l) => l.estimatedMinutes));
  const maxCases = Math.max(...visible.map((l) => l.casesArgued));

  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  function handleNameClick(label: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (selectedLabel === label) { setSelectedLabel(null); return; }
    const rect = containerRef.current!.getBoundingClientRect();
    setPanelPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setSelectedLabel(label);
  }

  const PANEL_W = 280;
  const PANEL_H = 200;

  function panelStyle(): React.CSSProperties {
    if (!containerRef.current) return { left: panelPos.x + 12, top: panelPos.y + 12 };
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    let left = panelPos.x + 14;
    let top = panelPos.y + 14;
    if (left + PANEL_W > cw) left = panelPos.x - PANEL_W - 14;
    if (top + PANEL_H > ch) top = panelPos.y - PANEL_H - 14;
    left = Math.max(4, left);
    top = Math.max(4, top);
    return { left, top };
  }

  const selectedLawyer = selectedLabel
    ? visible.find((l) => l.label === selectedLabel) ?? null
    : null;

  const mid = Math.ceil(visible.length / 2);
  const leftCol = visible.slice(0, mid);
  const rightCol = visible.slice(mid);

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={() => setSelectedLabel(null)}
    >
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
                isSelected={selectedLabel === l.label}
                onNameClick={(e) => handleNameClick(l.label, e)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Pinned panel */}
      {selectedLawyer && (
        <div
          className="absolute z-10 bg-white border border-gray-200 rounded shadow-lg p-3 w-72"
          style={panelStyle()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-800">{selectedLawyer.name}</p>
            <button
              onClick={() => setSelectedLabel(null)}
              className="text-gray-400 hover:text-gray-700 text-sm leading-none ml-2"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <ul className="space-y-1.5">
            {selectedLawyer.cases.map((c) => (
              <li key={c.slug} className="flex items-start gap-1.5 text-xs leading-snug">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
                <Link
                  href={`/cases/${c.slug}`}
                  className="text-blue-700 hover:underline"
                >
                  {c.caseNumber} – {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LawyerRow({
  lawyer: l,
  rank,
  maxMinutes,
  maxCases,
  isSelected,
  onNameClick,
}: {
  lawyer: LawyerStat;
  rank: number;
  maxMinutes: number;
  maxCases: number;
  isSelected: boolean;
  onNameClick: (e: React.MouseEvent) => void;
}) {
  const minutePct = (l.estimatedMinutes / maxMinutes) * 100;
  const casesPct = (l.casesArgued / maxCases) * 100;

  return (
    <div className="flex items-start gap-3 py-3">
      <span className="shrink-0 w-6 text-right text-xs text-gray-400 mt-0.5 font-medium">
        {rank}
      </span>

      <div className="flex-1 min-w-0">
        <button
          onClick={onNameClick}
          className={`text-sm font-bold text-left leading-tight mb-1.5 hover:text-blue-700 transition-colors cursor-pointer ${
            isSelected ? "text-blue-700 underline" : "text-gray-900"
          }`}
        >
          {l.name}
        </button>

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
