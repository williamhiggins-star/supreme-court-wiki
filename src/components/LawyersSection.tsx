"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LawyerStat, LawyerCase } from "@/lib/lawyers";

const TOP_N = 30;

// Justice display order (Chief Justice first, then by seniority)
const JUSTICE_ORDER = [
  "roberts", "thomas", "alito", "sotomayor",
  "kagan", "gorsuch", "kavanaugh", "barrett", "jackson",
] as const;

function justicePhoto(key: string): string {
  return `/images/justices/${key}.jpg`;
}

function justiceShortName(key: string): string {
  const names: Record<string, string> = {
    roberts: "Roberts", thomas: "Thomas", alito: "Alito",
    sotomayor: "Sotomayor", kagan: "Kagan", gorsuch: "Gorsuch",
    kavanaugh: "Kavanaugh", barrett: "Barrett", jackson: "Jackson",
  };
  return names[key] ?? key;
}

interface Props {
  lawyers: LawyerStat[];
}

export function LawyersSection({ lawyers }: Props) {
  const visible = lawyers.slice(0, TOP_N);

  const maxMinutes = Math.max(...visible.map((l) => l.estimatedMinutes));
  const maxCases   = Math.max(...visible.map((l) => l.casesArgued));

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

  const PANEL_W = 300;
  const PANEL_H_EST = 320;

  function panelStyle(): React.CSSProperties {
    if (!containerRef.current) return { left: panelPos.x + 12, top: panelPos.y + 12 };
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    let left = panelPos.x + 14;
    let top  = panelPos.y + 14;
    if (left + PANEL_W > cw)       left = panelPos.x - PANEL_W - 14;
    if (top  + PANEL_H_EST > ch)   top  = panelPos.y - PANEL_H_EST - 14;
    left = Math.max(4, left);
    top  = Math.max(4, top);
    return { left, top };
  }

  const selectedLawyer = selectedLabel
    ? visible.find((l) => l.label === selectedLabel) ?? null
    : null;

  const mid = Math.ceil(visible.length / 2);
  const leftCol  = visible.slice(0, mid);
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

      {/* Pinned popup */}
      {selectedLawyer && (
        <div
          className="absolute z-10 bg-white border border-gray-200 rounded shadow-lg w-[300px]"
          style={panelStyle()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-800 leading-tight">{selectedLawyer.name}</p>
            <button
              onClick={() => setSelectedLabel(null)}
              className="text-gray-400 hover:text-gray-700 text-sm leading-none ml-2 shrink-0"
              aria-label="Close"
            >✕</button>
          </div>

          {/* Win / Loss summary */}
          <WinLossSummary lawyer={selectedLawyer} />

          {/* Case list */}
          <ul className="px-3 pb-3 space-y-3 max-h-72 overflow-y-auto">
            {selectedLawyer.cases.map((c) => (
              <CaseRow key={c.slug} c={c} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Win/Loss summary bar ───────────────────────────────────────────────────────

function WinLossSummary({ lawyer }: { lawyer: LawyerStat }) {
  const pending = lawyer.casesArgued - lawyer.wins - lawyer.losses;
  return (
    <div className="flex items-center gap-4 px-3 py-2 border-b border-gray-100 text-xs font-semibold">
      <span className="text-emerald-600">Wins: {lawyer.wins}</span>
      <span className="text-rose-600">Losses: {lawyer.losses}</span>
      {pending > 0 && <span className="text-gray-400">Pending: {pending}</span>}
    </div>
  );
}

// ── Per-case row with justice circles ─────────────────────────────────────────

function CaseRow({ c }: { c: LawyerCase }) {
  const hasVoting = c.majorityAuthor || c.dissentAuthors?.length;

  return (
    <li className="text-xs leading-snug">
      {/* Outcome badge + case link */}
      <div className="flex items-start gap-1.5">
        <OutcomeBadge outcome={c.outcome} />
        <Link href={`/cases/${c.slug}`} className="text-blue-700 hover:underline flex-1">
          {c.caseNumber} – {c.title}
        </Link>
      </div>

      {/* Justice circles */}
      {hasVoting && (
        <JusticeCircles
          majorityAuthor={c.majorityAuthor}
          concurrenceAuthors={c.concurrenceAuthors ?? []}
          dissentAuthors={c.dissentAuthors ?? []}
        />
      )}
    </li>
  );
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (outcome === "won")
    return <span className="shrink-0 inline-block px-1 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">W</span>;
  if (outcome === "lost")
    return <span className="shrink-0 inline-block px-1 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">L</span>;
  return <span className="shrink-0 inline-block px-1 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-400">–</span>;
}

function JusticeCircles({
  majorityAuthor,
  concurrenceAuthors,
  dissentAuthors,
}: {
  majorityAuthor?: string;
  concurrenceAuthors: string[];
  dissentAuthors: string[];
}) {
  const dissentSet = new Set(dissentAuthors);
  const isPer = majorityAuthor === "per_curiam";

  // Build ordered list: majority author first, then seniority order for the rest
  const ordered: string[] = [];
  if (majorityAuthor && !isPer) ordered.push(majorityAuthor);
  for (const k of JUSTICE_ORDER) {
    if (!ordered.includes(k)) ordered.push(k);
  }

  return (
    <div className="flex items-center gap-1 mt-1 ml-5 flex-wrap">
      {isPer && (
        <span className="text-[10px] text-gray-400 italic mr-1">Per curiam</span>
      )}
      {ordered.map((key) => {
        const isMaj     = key === majorityAuthor && !isPer;
        const isDissent = dissentSet.has(key);
        const ring = isMaj
          ? "ring-2 ring-emerald-500"
          : isDissent
          ? "ring-2 ring-rose-400"
          : "ring-1 ring-gray-200";
        const title = [
          justiceShortName(key),
          isMaj     ? "(majority)" : "",
          isDissent ? "(dissent)"  : "",
          concurrenceAuthors.includes(key) ? "(concur)" : "",
        ].filter(Boolean).join(" ");

        return (
          <div key={key} className={`relative rounded-full overflow-hidden shrink-0 ${ring}`} title={title} style={{ width: 22, height: 22 }}>
            <Image
              src={justicePhoto(key)}
              alt={justiceShortName(key)}
              fill
              sizes="22px"
              className="object-cover object-top grayscale"
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Lawyer row (unchanged bar layout) ─────────────────────────────────────────

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
  const casesPct  = (l.casesArgued / maxCases) * 100;

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
              <div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${minutePct}%` }} />
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
              <div className="h-2.5 rounded-full bg-amber-400" style={{ width: `${casesPct}%` }}/>
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
