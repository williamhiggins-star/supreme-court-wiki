"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  CircuitMapData,
  CircuitCase,
  StateFeature,
} from "@/lib/circuits";
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
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const centroids = getCircuitCentroids(mapData.states);

  function handleStateEnter(
    circuit: number,
    e: React.MouseEvent<SVGPathElement>
  ) {
    setHoveredCircuit(circuit);
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement)
      .getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  function handleStateMove(e: React.MouseEvent<SVGPathElement>) {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement)
      .getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  const hoveredCases = hoveredCircuit ? (casesByCircuit[hoveredCircuit] ?? []) : [];

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Map */}
      <div className="relative w-full lg:flex-1">
        <svg
          viewBox={mapData.viewBox}
          className="w-full h-auto"
          style={{ display: "block" }}
        >
          {/* State fills */}
          {mapData.states.map((state: StateFeature) => (
            <path
              key={state.id}
              d={state.pathD}
              fill={
                hoveredCircuit === state.circuit
                  ? CIRCUIT_DARK[state.circuit]
                    ? CIRCUIT_COLORS[state.circuit]
                    : "#e5e7eb"
                  : CIRCUIT_COLORS[state.circuit] ?? "#e5e7eb"
              }
              stroke="white"
              strokeWidth="0.75"
              strokeLinejoin="round"
              style={{
                opacity: hoveredCircuit
                  ? hoveredCircuit === state.circuit
                    ? 1
                    : 0.5
                  : 1,
                transition: "opacity 0.15s, fill 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => handleStateEnter(state.circuit, e)}
              onMouseMove={handleStateMove}
              onMouseLeave={() => setHoveredCircuit(null)}
            />
          ))}

          {/* State borders (thin white lines already rendered via fill strokes) */}

          {/* Circuit borders (thick dark lines between circuits) */}
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

          {/* Case count badges per circuit */}
          {Object.entries(casesByCircuit).map(([circuitStr, cases]) => {
            const circuit = Number(circuitStr);
            const center = centroids[circuit];
            if (!center) return null;
            const [cx, cy] = center;
            const upcoming = cases.filter((c) => c.status === "upcoming").length;
            const argued = cases.filter((c) => c.status === "argued").length;
            const total = cases.length;
            const r = total >= 10 ? 14 : 11;

            return (
              <g
                key={circuit}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  setHoveredCircuit(circuit);
                  const rect = (
                    e.currentTarget.ownerSVGElement as SVGSVGElement
                  ).getBoundingClientRect();
                  setTooltipPos({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
                onMouseLeave={() => setHoveredCircuit(null)}
              >
                {/* Split badge: orange top (upcoming) + blue bottom (argued) */}
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
                  stroke="white"
                  strokeWidth="1.5"
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

        {/* Tooltip */}
        {hoveredCircuit && (
          <div
            className="absolute z-10 bg-white border border-gray-200 rounded shadow-lg p-3 min-w-48 max-w-72 pointer-events-none"
            style={{
              left: tooltipPos.x + 12,
              top: tooltipPos.y - 12,
              transform:
                tooltipPos.x > 700 ? "translateX(-110%)" : undefined,
            }}
          >
            <p className="text-xs font-bold text-gray-700 mb-1">
              {CIRCUIT_NAMES[hoveredCircuit]}
            </p>
            {hoveredCases.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No pending cases</p>
            ) : (
              <ul className="space-y-1">
                {hoveredCases.map((c) => (
                  <li key={c.slug} className="text-xs leading-tight">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                        c.status === "upcoming"
                          ? "bg-amber-400"
                          : "bg-blue-400"
                      }`}
                    />
                    <Link
                      href={`/cases/${c.slug}`}
                      className="text-blue-700 hover:underline pointer-events-auto"
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
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-sm border border-gray-400 bg-gray-100" />
            <span className="inline-block w-2 h-2 rounded-sm border border-gray-400 bg-blue-100 ml-1" />
            State / circuit region colors
          </div>
          <p className="text-gray-400 text-[10px] pt-1">
            Hover a state or badge to see cases. Bold lines show circuit
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
                  <div
                    key={circuit}
                    className="px-3 py-2 flex items-start gap-2"
                  >
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
