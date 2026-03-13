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
          <div key={ci} className="divide-y divide-[var(--tan)]/30">
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
          className="absolute z-10 bg-[var(--ivory)] border border-[var(--tan)] rounded shadow-lg w-[300px]"
          style={panelStyle()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-[var(--tan)]/30">
            <p
              className="text-[var(--charcoal)] leading-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "13px" }}
            >
              {selectedLawyer.name}
            </p>
            <button
              onClick={() => setSelectedLabel(null)}
              className="text-[var(--warm-gray)] hover:text-[var(--charcoal)] text-sm leading-none ml-2 shrink-0"
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
    <div
      className="flex items-center gap-4 px-3 py-2 border-b border-[var(--tan)]/30"
      style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", fontWeight: 500 }}
    >
      <span className="text-[var(--forest)]">Wins: {lawyer.wins}</span>
      <span className="text-[var(--rust)]">Losses: {lawyer.losses}</span>
      {pending > 0 && <span className="text-[var(--warm-gray)]">Pending: {pending}</span>}
    </div>
  );
}

// ── Per-case row with justice circles ─────────────────────────────────────────

function CaseRow({ c }: { c: LawyerCase }) {
  const hasVoting = c.majorityAuthor || c.dissentAuthors?.length;

  return (
    <li className="leading-snug" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
      {/* Outcome badge + case link */}
      <div className="flex items-start gap-1.5">
        <OutcomeBadge outcome={c.outcome} />
        <Link href={`/cases/${c.slug}`} className="text-[var(--rust)] hover:underline flex-1">
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
    return (
      <span
        className="shrink-0 inline-block px-1 py-0.5 rounded-[3px] border border-[var(--forest)]/30 bg-[var(--forest)]/10 text-[var(--forest)]"
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px" }}
      >
        W
      </span>
    );
  if (outcome === "lost")
    return (
      <span
        className="shrink-0 inline-block px-1 py-0.5 rounded-[3px] border border-[var(--rust)]/30 bg-[var(--rust)]/10 text-[var(--rust)]"
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px" }}
      >
        L
      </span>
    );
  return (
    <span
      className="shrink-0 inline-block px-1 py-0.5 rounded-[3px] border border-[var(--tan)] bg-[var(--tan)]/10 text-[var(--warm-gray)]"
      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px" }}
    >
      –
    </span>
  );
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
        <span className="text-[var(--warm-gray)] italic mr-1" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>Per curiam</span>
      )}
      {ordered.map((key) => {
        const isMaj     = key === majorityAuthor && !isPer;
        const isDissent = dissentSet.has(key);
        const ring = isMaj
          ? "ring-2 ring-[var(--forest)]"
          : isDissent
          ? "ring-2 ring-[var(--rust)]"
          : "ring-1 ring-[var(--tan)]";
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

// ── Lawyer row ─────────────────────────────────────────────────────────────────

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
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }} className="shrink-0 w-6 text-right text-[var(--warm-gray)] mt-0.5">
        {rank}
      </span>

      <div className="flex-1 min-w-0">
        <button
          onClick={onNameClick}
          className={`text-left leading-tight mb-1.5 hover:text-[var(--rust)] transition-colors cursor-pointer ${
            isSelected ? "text-[var(--rust)] underline" : "text-[var(--charcoal)]"
          }`}
          style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "14px" }}
        >
          {l.name}
        </button>

        {/* Speaking time bar */}
        <div className="mb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--tan)]/20 rounded-full h-2.5 overflow-hidden">
              <div className="h-2.5 rounded-full bg-[var(--rust)]" style={{ width: `${minutePct}%` }} />
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] whitespace-nowrap w-16 text-right">
              {l.estimatedMinutes.toLocaleString()} min
            </span>
          </div>
          <p className="text-[var(--warm-gray)] mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Speaking time</p>
        </div>

        {/* Cases argued bar */}
        <div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--tan)]/20 rounded-full h-2.5 overflow-hidden">
              <div className="h-2.5 rounded-full bg-[var(--gold)]" style={{ width: `${casesPct}%` }}/>
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }} className="text-[var(--warm-gray)] whitespace-nowrap w-16 text-right">
              {l.casesArgued} {l.casesArgued === 1 ? "case" : "cases"}
            </span>
          </div>
          <p className="text-[var(--warm-gray)] mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cases argued</p>
        </div>
      </div>
    </div>
  );
}
