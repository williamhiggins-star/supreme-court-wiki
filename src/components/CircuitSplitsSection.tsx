import Link from "next/link";
import type { CircuitSplit, CircuitPosition, CircuitCaseRef } from "@/lib/circuit-splits";

interface Props {
  splits: CircuitSplit[];
  generated: string;
}

// All area chips now use warm-gray with tan styling to stay within the DYSTL palette
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

function statusBadge(split: CircuitSplit) {
  if (split.status === "scotus_pending")
    return (
      <Link
        href={split.relatedScotusSlug ? `/cases/${split.relatedScotusSlug}` : "#"}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] border border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors"
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}
        title="SCOTUS cert granted"
      >
        ★ SCOTUS pending
      </Link>
    );
  if (split.status === "scotus_resolved")
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-[3px] border border-[var(--forest)] bg-[var(--forest)]/10 text-[var(--forest)]"
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase" }}
      >
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
      className="inline-block px-2 py-0.5 rounded-[3px] bg-[var(--charcoal)] text-[var(--cream)] hover:bg-[var(--warm-gray)] transition-colors"
      style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500, fontSize: "11px" }}
    >
      {c.shortName}
    </a>
  );
}

function PositionColumn({ pos, index }: { pos: CircuitPosition; index: number }) {
  const borderColour = index === 0 ? "border-[var(--forest)]" : "border-[var(--rust)]";
  const labelColour  = index === 0 ? "text-[var(--forest)]"   : "text-[var(--rust)]";
  const dotColour    = index === 0 ? "bg-[var(--forest)]"     : "bg-[var(--rust)]";

  return (
    <div className={`flex-1 border-t-2 ${borderColour} pt-3 px-4 pb-4`}>
      <p
        className={`mb-1 ${labelColour}`}
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}
      >
        {pos.label}
      </p>
      <p className="text-[var(--charcoal)] leading-relaxed mb-3" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "13px" }}>
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
          <div key={`${c.key}-link-${c.caseName}`} className="flex items-start gap-1.5 text-[var(--warm-gray)] leading-snug" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dotColour}`} />
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--rust)] hover:underline"
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

/** Compact embed for case pages: description + positions, no question header. */
export function SplitCardEmbed({ split }: { split: CircuitSplit }) {
  return (
    <div className="bg-[var(--ivory)] border border-[var(--tan)] rounded-lg overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      {/* Description only — legalQuestion is already on the case page */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--tan)]/30">
        <p className="text-[var(--warm-gray)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "13px" }}>
          {split.description}
        </p>
      </div>

      {/* Positions */}
      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-[var(--tan)]/30">
        {split.positions.map((pos, i) => (
          <PositionColumn key={pos.label} pos={pos} index={i} />
        ))}
      </div>
    </div>
  );
}

export function SplitCard({ split }: { split: CircuitSplit }) {
  const totalCircuits = split.positions.reduce((n, p) => n + p.circuits.length, 0);

  return (
    <div className="bg-[var(--ivory)] border border-[var(--tan)] rounded-lg overflow-hidden hover:border-[var(--rust)] hover:shadow-md transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--tan)]/30">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          {areaChip(split.area)}
          {statusBadge(split)}
          <span className="ml-auto text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
            {totalCircuits} circuit{totalCircuits !== 1 ? "s" : ""}
          </span>
        </div>

        <p
          className="text-[var(--charcoal)] leading-snug mb-1.5"
          style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: "15px" }}
        >
          {split.legalQuestion}
        </p>
        <p className="text-[var(--warm-gray)] leading-relaxed" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "13px" }}>
          {split.description}
        </p>
      </div>

      {/* Positions */}
      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-[var(--tan)]/30">
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
      <p className="text-[var(--warm-gray)] italic" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px" }}>
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
      <p className="mt-6 text-right text-[var(--warm-gray)]" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>
        Last updated {generated} · Source: CourtListener · Analysis: Claude AI
      </p>
    </div>
  );
}
