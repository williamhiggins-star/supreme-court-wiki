"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { CircuitMapData, CircuitCase, StateFeature } from "@/lib/circuits";
import {
  CIRCUIT_NAMES,
  CIRCUIT_COLORS,
  CIRCUIT_DARK,
  getCircuitCentroids,
} from "@/lib/circuits";

interface Props {
  mapData: CircuitMapData;
  casesByCircuit: Record<number, CircuitCase[]>;
}

export function CircuitMap({ mapData, casesByCircuit }: Props) {
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

  // Panel dimensions (approximate) used to keep it on-screen
  const PANEL_W = 260;
  const PANEL_H = 220;

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
              stroke="white"
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
            stroke="#1e293b"
            strokeWidth="2.0"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />

          {/* Outer/coastal border */}
          <path
            d={mapData.outerBorderPath}
            fill="none"
            stroke="#94a3b8"
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
                      fill="#f59e0b"
                    />
                    <path
                      d={`M ${cx} ${cy + r} A ${r} ${r} 0 0 1 ${cx} ${cy - r} Z`}
                      fill="#3b82f6"
                    />
                  </>
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={upcoming > 0 ? "#f59e0b" : "#3b82f6"}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={isSelected ? "#1e293b" : "white"}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={total >= 10 ? "9" : "10"}
                  fontWeight="700"
                  fill="white"
                  pointerEvents="none"
                >
                  {total}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Pinned panel — appears when a circuit is selected */}
        {panelCircuit && (
          <div
            className="absolute z-10 bg-white border border-gray-200 rounded shadow-lg p-3 w-64"
            style={panelStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-800">
                {CIRCUIT_NAMES[panelCircuit]}
              </p>
              <button
                onClick={() => setSelectedCircuit(null)}
                className="text-gray-400 hover:text-gray-700 text-sm leading-none ml-2"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {panelCases.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No pending cases</p>
            ) : (
              <ul className="space-y-1.5">
                {panelCases.map((c) => (
                  <li key={c.slug} className="flex items-start gap-1.5 text-xs leading-snug">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                        c.status === "upcoming" ? "bg-amber-400" : "bg-blue-400"
                      }`}
                    />
                    <Link
                      href={`/cases/${c.slug}`}
                      className="text-blue-700 hover:underline"
                    >
                      {c.caseNumber} – {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Legend + sidebar */}
      <div className="lg:w-64 shrink-0 space-y-4">
        {/* Badge legend */}
        <div className="bg-white border border-gray-200 rounded p-3 text-xs text-gray-600 space-y-1.5">
          <p className="font-semibold text-gray-700 mb-2">Badge colors</p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-amber-400" />
            Upcoming argument
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
            Argued, awaiting decision
          </div>
          <p className="text-gray-400 text-[10px] pt-1">
            Click a state or badge to see cases. Bold lines show circuit
            boundaries.
          </p>
        </div>

        {/* Per-circuit list */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <p className="text-xs font-semibold text-gray-700 px-3 py-2 border-b border-gray-100">
            Pending cases by circuit
          </p>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
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
                      <p className="text-[11px] font-semibold text-gray-700 leading-none mb-0.5">
                        {CIRCUIT_NAMES[circuit]}
                      </p>
                      {cases.length === 0 ? (
                        <p className="text-[10px] text-gray-400">—</p>
                      ) : (
                        <p className="text-[10px] text-gray-500">
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
