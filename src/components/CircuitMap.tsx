"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { CircuitMapData, CircuitCase, StateFeature, CircuitSplitSummary } from "@/lib/circuits";
import {
  CIRCUIT_NAMES,
  CIRCUIT_COLORS,
  CIRCUIT_DARK,
  getCircuitCentroids,
} from "@/lib/circuits";

interface Props {
  mapData: CircuitMapData;
  casesByCircuit: Record<number, CircuitCase[]>;
  splitsByCircuit: Record<number, CircuitSplitSummary[]>;
}

export function CircuitMap({ mapData, casesByCircuit, splitsByCircuit }: Props) {
  const [hoveredCircuit, setHoveredCircuit] = useState<number | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<number | null>(null);
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const centroids = getCircuitCentroids(mapData.states);

  function handleCircuitClick(circuit: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (selectedCircuit === circuit) {
      setSelectedCircuit(null);
      return;
    }
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPanelPos({ x, y });
    setSelectedCircuit(circuit);
  }

  const panelCircuit = selectedCircuit;
  const panelCases = panelCircuit ? (casesByCircuit[panelCircuit] ?? []) : [];
  const panelSplits = panelCircuit ? (splitsByCircuit[panelCircuit] ?? []) : [];

  const PANEL_W = 288;
  const PANEL_H = 320;

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

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">

      {/* Map */}
      <div ref={containerRef} className="relative w-full lg:flex-1">
        <svg
          viewBox={mapData.viewBox}
          className="w-full h-auto"
          style={{ display: "block" }}
          onClick={() => setSelectedCircuit(null)}
        >
          {/* State fills */}
          {mapData.states.map((state: StateFeature) => (
            <path
              key={state.id}
              d={state.pathD}
              fill={CIRCUIT_COLORS[state.circuit] ?? "#e5e7eb"}
              stroke="#C4A882"
              strokeWidth="0.75"
              strokeLinejoin="round"
              style={{
                opacity:
                  hoveredCircuit && hoveredCircuit !== state.circuit
                    ? 0.45
                    : selectedCircuit && selectedCircuit !== state.circuit
                    ? 0.55
                    : 1,
                transition: "opacity 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={() => setHoveredCircuit(state.circuit)}
              onMouseLeave={() => setHoveredCircuit(null)}
              onClick={(e) => handleCircuitClick(state.circuit, e)}
            />
          ))}

          {/* Circuit borders */}
          <path
            d={mapData.circuitBorderPath}
            fill="none"
            stroke="#6B6560"
            strokeWidth="2.0"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />

          {/* Outer/coastal border */}
          <path
            d={mapData.outerBorderPath}
            fill="none"
            stroke="#C4A882"
            strokeWidth="0.75"
            pointerEvents="none"
          />

          {/* Case count badges */}
          {Object.entries(casesByCircuit).map(([circuitStr, cases]) => {
            const circuit = Number(circuitStr);
            const center = centroids[circuit];
            if (!center) return null;
            const [cx, cy] = center;
            const upcoming = cases.filter((c) => c.status === "upcoming").length;
            const argued = cases.filter((c) => c.status === "argued").length;
            const total = cases.length;
            const r = total >= 10 ? 14 : 11;
            const isSelected = selectedCircuit === circuit;

            return (
              <g
                key={circuit}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredCircuit(circuit)}
                onMouseLeave={() => setHoveredCircuit(null)}
                onClick={(e) => handleCircuitClick(circuit, e)}
              >
                {upcoming > 0 && argued > 0 ? (
                  <>
                    <path
                      d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`}
                      fill="#8B6914"
                    />
                    <path
                      d={`M ${cx} ${cy + r} A ${r} ${r} 0 0 1 ${cx} ${cy - r} Z`}
                      fill="#B85C38"
                    />
                  </>
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={upcoming > 0 ? "#B85C38" : "#8B6914"}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={isSelected ? "#1A1A1A" : "#FAFAF7"}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={total >= 10 ? "9" : "10"}
                  fontWeight="700"
                  fill="#FAFAF7"
                  pointerEvents="none"
                  fontFamily="'DM Mono', monospace"
                >
                  {total}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Pinned popup panel */}
        {panelCircuit && (
          <div
            className="absolute z-10 bg-[var(--charcoal)] border border-[var(--warm-gray)] rounded shadow-lg p-3 w-72 max-h-80 overflow-y-auto"
            style={panelStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <p
                className="text-[var(--cream)]"
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px" }}
              >
                {CIRCUIT_NAMES[panelCircuit]}
              </p>
              <button
                onClick={() => setSelectedCircuit(null)}
                className="text-[var(--warm-gray)] hover:text-[var(--cream)] text-sm leading-none ml-2"
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            {/* SCOTUS Cases */}
            {panelCases.length === 0 ? (
              <p className="text-[var(--warm-gray)] italic" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "12px" }}>No pending cases</p>
            ) : (
              <ul className="space-y-1.5 mb-2">
                {panelCases.map((c) => (
                  <li key={c.slug} className="flex items-start gap-1.5 leading-snug" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                        c.status === "upcoming" ? "bg-[var(--rust)]" : "bg-[var(--gold)]"
                      }`}
                    />
                    <Link
                      href={`/cases/${c.slug}`}
                      className="text-[var(--cream)] hover:underline"
                    >
                      {c.caseNumber} &ndash; {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Circuit Splits in popup */}
            {panelSplits.length > 0 && (
              <>
                {panelCases.length > 0 && <hr className="border-[var(--warm-gray)]/30 my-2" />}
                <p
                  className="text-[var(--cream)] mb-1.5"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.12em" }}
                >
                  Active Circuit Splits
                </p>
                <ul className="space-y-2.5">
                  {panelSplits.map((s) => (
                    <li key={s.splitId} className="leading-snug" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px" }}>
                      <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded-[3px] bg-[var(--warm-gray)]/30 text-[var(--cream)]"
                          style={{ fontSize: "9px", fontWeight: 500 }}
                        >
                          {s.area}
                        </span>
                        {s.status === "scotus_pending" && (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-[3px] bg-[var(--gold)]/30 text-[var(--gold)]"
                            style={{ fontSize: "9px", fontWeight: 500 }}
                          >
                            SCOTUS
                          </span>
                        )}
                      </div>
                      <p className="text-[var(--cream)]" style={{ fontSize: "12px" }}>
                        {s.legalQuestion.length > 80
                          ? s.legalQuestion.slice(0, 80) + "\u2026"
                          : s.legalQuestion}
                      </p>
                      <p className="text-[var(--warm-gray)] mt-0.5" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
                        This circuit: {s.positionLabel}
                      </p>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/appeals"
                  className="block mt-2 text-[var(--rust)] hover:underline text-right"
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}
                >
                  View all circuit splits
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="lg:w-64 shrink-0 space-y-4">
        {/* Badge legend */}
        <div className="bg-[var(--ivory)] border border-[var(--tan)] rounded p-3 space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p
            className="text-[var(--charcoal)] mb-2"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Badge colors
          </p>
          <div className="flex items-center gap-2 text-[var(--charcoal)]" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px" }}>
            <span className="inline-block w-3 h-3 rounded-full bg-[var(--rust)]" />
            Upcoming argument
          </div>
          <div className="flex items-center gap-2 text-[var(--charcoal)]" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px" }}>
            <span className="inline-block w-3 h-3 rounded-full bg-[var(--gold)]" />
            Argued, awaiting decision
          </div>
          <p className="text-[var(--warm-gray)] pt-1" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
            Click a state or badge to see cases. Bold lines show circuit
            boundaries.
          </p>
        </div>

        {/* Per-circuit list */}
        <div className="bg-[var(--ivory)] border border-[var(--tan)] rounded overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p
            className="text-[var(--charcoal)] px-3 py-2 border-b border-[var(--tan)]"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Pending cases by circuit
          </p>
          <div className="divide-y divide-[var(--tan)]/30 max-h-96 overflow-y-auto">
            {Object.keys(CIRCUIT_NAMES)
              .map(Number)
              .filter((c) => c !== 13)
              .map((circuit) => {
                const cases = casesByCircuit[circuit] ?? [];
                return (
                  <div key={circuit} className="px-3 py-2 flex items-start gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5"
                      style={{ background: CIRCUIT_DARK[circuit] }}
                    />
                    <div className="min-w-0">
                      <p
                        className="text-[var(--charcoal)] leading-none mb-0.5"
                        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px" }}
                      >
                        {CIRCUIT_NAMES[circuit]}
                      </p>
                      {cases.length === 0 ? (
                        <p className="text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>&mdash;</p>
                      ) : (
                        <p className="text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
                          {cases.length} case{cases.length !== 1 ? "s" : ""}
                          {" ("}
                          {cases.filter((c) => c.status === "upcoming").length > 0 &&
                            `${cases.filter((c) => c.status === "upcoming").length} upcoming`}
                          {cases.filter((c) => c.status === "upcoming").length > 0 &&
                            cases.filter((c) => c.status === "argued").length > 0 &&
                            ", "}
                          {cases.filter((c) => c.status === "argued").length > 0 &&
                            `${cases.filter((c) => c.status === "argued").length} argued`}
                          {")"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

    </div>
  );
}
