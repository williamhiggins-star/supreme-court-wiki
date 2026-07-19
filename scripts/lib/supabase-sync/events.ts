/**
 * events.ts — event diffing (Decision 6: scotus_split_events is append-only history).
 *
 * Events are derived by comparing the CURRENT committed dashboard state against
 * PRIOR Supabase state, then filtered against events that already exist so
 * re-runs emit nothing. Lifecycle events are derived from current state and
 * made once-only by dedup; incremental events (circuit_added / split_deepened)
 * require the prior split to compare against.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TRANSITION RULES                                                           │
 * ├───────────────┬────────────────────┬───────────────────────────────────── │
 * │ SOURCE         │ CONDITION          │ EVENT(S) EMITTED                      │
 * ├───────────────┼────────────────────┼───────────────────────────────────── │
 * │ case in corpus │ status != petition │ scotus_case_events cert_granted       │
 * │                │                    │   (occurred_at NULL — no cert date)   │
 * │ case           │ argued & date<=now │ scotus_case_events argued             │
 * │                │                    │   (occurred_at = argumentDate)        │
 * │ case           │ decided | dec.date │ scotus_case_events decided            │
 * │                │                    │   (occurred_at = decisionDate)        │
 * │ split (new)    │ no prior row       │ scotus_split_events split_opened      │
 * │                │                    │  + scotus_case_events split_opened    │
 * │                │                    │    (case_id NULL, metadata.split_slug)│
 * │ split          │ pending|resolved   │ scotus_split_events cert_granted      │
 * │                │  & related slug    │                                       │
 * │ split          │ status resolved    │ scotus_split_events split_resolved    │
 * │                │                    │  + scotus_case_events split_resolved  │
 * │                │                    │    (case_id NULL, metadata.split_slug)│
 * │ split (prior)  │ new circuit key    │ scotus_split_events circuit_added     │
 * │                │                    │    (circuit = key)                    │
 * │ split (prior)  │ depth increased    │ scotus_split_events split_deepened    │
 * │                │                    │  + scotus_case_events split_deepened  │
 * │ appellate imp. │ each impact record │ scotus_case_events appellate_impact   │
 * │                │                    │    (case_id NULL, metadata.impact)    │
 * └───────────────┴────────────────────┴───────────────────────────────────── │
 *
 * Dedup keys (idempotency): a candidate is inserted only if no event with the
 * same dedup key already exists. Lifecycle events dedup to one per entity;
 * circuit_added dedups per (split, circuit); split_deepened dedups per
 * (split, depth); appellate_impact dedups per impact id.
 */

import type { CaseSummary, CircuitSplit } from "../../../src/types/index.js";
import type { AppellateImpact } from "./data.js";
import { caseSourceUrl, splitDepth, splitCircuitKeys } from "./mappers.js";

export type SyncMode = "sync" | "backfill";

export type CaseEventType =
  | "cert_granted"
  | "argued"
  | "decided"
  | "split_opened"
  | "split_deepened"
  | "split_resolved"
  | "appellate_impact";

export type SplitEventType =
  | "split_opened"
  | "split_deepened"
  | "split_narrowed"
  | "circuit_added"
  | "cert_granted"
  | "split_resolved";

export interface CaseEventInsert {
  case_id: string | null;
  event_type: CaseEventType;
  description: string | null;
  occurred_at: string | null;
  processed: boolean;
  source_url: string | null;
  metadata: Record<string, unknown>;
}

export interface SplitEventInsert {
  split_id: string;
  event_type: SplitEventType;
  description: string | null;
  circuit: string | null;
  occurred_at: string | null;
  source_url: string | null;
  metadata: Record<string, unknown>;
}

export interface PriorSplit {
  id: string;
  status: string | null;
  depth: number | null;
  circuitKeys: string[];
}

// Loose shapes used to build dedup keys from BOTH existing rows and candidates.
interface CaseEventLike {
  case_id?: string | null;
  event_type: string;
  metadata?: Record<string, unknown> | null;
}
interface SplitEventLike {
  split_id: string;
  event_type: string;
  circuit?: string | null;
  metadata?: Record<string, unknown> | null;
}

function toDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function baseMeta(
  mode: SyncMode,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return mode === "backfill" ? { backfill: true, ...extra } : { ...extra };
}

// ── Dedup keys ───────────────────────────────────────────────────────────────

export function caseEventDedupKey(e: CaseEventLike): string {
  const cid = e.case_id ?? "null";
  const m = e.metadata ?? {};
  let disc = "";
  switch (e.event_type) {
    case "appellate_impact":
      disc = String(m.impact_id ?? "");
      break;
    case "split_opened":
    case "split_resolved":
      disc = String(m.split_slug ?? "");
      break;
    case "split_deepened":
      disc = `${m.split_slug ?? ""}:${m.depth ?? ""}`;
      break;
    default:
      disc = ""; // cert_granted / argued / decided → one per case
  }
  return `${cid}|${e.event_type}|${disc}`;
}

export function splitEventDedupKey(e: SplitEventLike): string {
  const m = e.metadata ?? {};
  let disc = "";
  if (e.event_type === "circuit_added") {
    disc = String(e.circuit ?? m.circuit ?? "");
  } else if (e.event_type === "split_deepened") {
    disc = String(m.depth ?? "");
  }
  return `${e.split_id}|${e.event_type}|${disc}`;
}

// ── Case lifecycle events ────────────────────────────────────────────────────

export function deriveCaseEvents(
  c: CaseSummary,
  caseId: string,
  mode: SyncMode,
): CaseEventInsert[] {
  const events: CaseEventInsert[] = [];
  const src = caseSourceUrl(c);
  const status = c.docketStatus;

  // A case is in our corpus only after cert was granted (petition = not yet granted).
  if (status !== "petition") {
    events.push({
      case_id: caseId,
      event_type: "cert_granted",
      description: `Certiorari granted: ${c.title}`,
      occurred_at: null, // dashboard does not track the cert-grant date
      processed: false,
      source_url: src,
      metadata: baseMeta(mode, { slug: c.slug, docket_number: c.caseNumber }),
    });

    const arguedDate = toDate(c.argumentDate);
    const today = new Date().toISOString().slice(0, 10);
    if (arguedDate && arguedDate <= today) {
      events.push({
        case_id: caseId,
        event_type: "argued",
        description: `Argued: ${c.title}`,
        occurred_at: arguedDate,
        processed: false,
        source_url: c.transcriptUrl || src,
        metadata: baseMeta(mode, { slug: c.slug }),
      });
    }

    const decided = status === "decided" || Boolean(c.decisionDate);
    if (decided) {
      events.push({
        case_id: caseId,
        event_type: "decided",
        description: c.outcome || `Decided: ${c.title}`,
        occurred_at: toDate(c.decisionDate),
        processed: false,
        source_url: src,
        metadata: baseMeta(mode, {
          slug: c.slug,
          outcome: c.outcome ?? null,
          majority_author: c.majorityAuthor ?? null,
        }),
      });
    }
  }

  return events;
}

// ── Split lifecycle + incremental events ─────────────────────────────────────

export interface DerivedSplitEvents {
  splitEvents: SplitEventInsert[];
  caseEvents: CaseEventInsert[];
}

export function deriveSplitEvents(
  split: CircuitSplit,
  splitId: string,
  prior: PriorSplit | undefined,
  mode: SyncMode,
): DerivedSplitEvents {
  const splitEvents: SplitEventInsert[] = [];
  const caseEvents: CaseEventInsert[] = [];
  const occurred = toDate(split.lastUpdated);
  const src = firstSplitUrl(split);
  const related = split.relatedScotusSlug ?? null;

  // split_opened — implied for every split; deduped to once per split.
  splitEvents.push({
    split_id: splitId,
    event_type: "split_opened",
    description: `Circuit split identified: ${split.legalQuestion}`,
    circuit: null,
    occurred_at: occurred,
    source_url: src,
    metadata: baseMeta(mode, { slug: split.id, area: split.area }),
  });
  caseEvents.push({
    case_id: null,
    event_type: "split_opened",
    description: `Circuit split opened: ${split.legalQuestion}`,
    occurred_at: occurred,
    processed: false,
    source_url: src,
    metadata: baseMeta(mode, {
      split_slug: split.id,
      related_case_slug: related,
      area: split.area,
    }),
  });

  // cert_granted (split) — SCOTUS took up the split.
  if (
    (split.status === "scotus_pending" || split.status === "scotus_resolved") &&
    related
  ) {
    splitEvents.push({
      split_id: splitId,
      event_type: "cert_granted",
      description: `SCOTUS granted cert on this split (${related}).`,
      circuit: null,
      occurred_at: occurred,
      source_url: src,
      metadata: baseMeta(mode, {
        slug: split.id,
        related_case_slug: related,
      }),
    });
  }

  // split_resolved — SCOTUS decided the split.
  if (split.status === "scotus_resolved") {
    splitEvents.push({
      split_id: splitId,
      event_type: "split_resolved",
      description: `Circuit split resolved by SCOTUS${related ? ` (${related})` : ""}.`,
      circuit: null,
      occurred_at: occurred,
      source_url: src,
      metadata: baseMeta(mode, { slug: split.id, related_case_slug: related }),
    });
    caseEvents.push({
      case_id: null,
      event_type: "split_resolved",
      description: `Circuit split resolved: ${split.legalQuestion}`,
      occurred_at: occurred,
      processed: false,
      source_url: src,
      metadata: baseMeta(mode, {
        split_slug: split.id,
        related_case_slug: related,
      }),
    });
  }

  // Incremental events require a prior split to diff against. On a brand-new
  // split the circuits are captured by split_opened, so we do NOT emit
  // circuit_added / split_deepened for the initial set.
  if (prior) {
    const priorKeys = new Set(prior.circuitKeys);
    for (const key of splitCircuitKeys(split)) {
      if (!priorKeys.has(key)) {
        splitEvents.push({
          split_id: splitId,
          event_type: "circuit_added",
          description: `Circuit ${key} joined the split.`,
          circuit: key,
          occurred_at: occurred,
          source_url: src,
          metadata: baseMeta(mode, { slug: split.id, circuit: key }),
        });
      }
    }

    const depth = splitDepth(split);
    if (prior.depth != null && depth > prior.depth) {
      splitEvents.push({
        split_id: splitId,
        event_type: "split_deepened",
        description: `Split deepened to ${depth} circuits.`,
        circuit: null,
        occurred_at: occurred,
        source_url: src,
        metadata: baseMeta(mode, { slug: split.id, depth }),
      });
      caseEvents.push({
        case_id: null,
        event_type: "split_deepened",
        description: `Circuit split deepened: ${split.legalQuestion}`,
        occurred_at: occurred,
        processed: false,
        source_url: src,
        metadata: baseMeta(mode, {
          split_slug: split.id,
          related_case_slug: related,
          depth,
        }),
      });
    }
  }

  return { splitEvents, caseEvents };
}

// ── Appellate-impact events ──────────────────────────────────────────────────

export function deriveAppellateEvents(
  impacts: AppellateImpact[],
  mode: SyncMode,
): CaseEventInsert[] {
  return impacts.map((imp) => ({
    case_id: null,
    event_type: "appellate_impact" as const,
    description: `${imp.court ?? "Appellate"} ${imp.area ?? ""}: ${imp.caseName}`.trim(),
    occurred_at: toDate(imp.date),
    processed: false,
    source_url: imp.url ?? null,
    metadata: baseMeta(mode, { impact_id: imp.id, impact: imp }),
  }));
}

function firstSplitUrl(split: CircuitSplit): string | null {
  for (const pos of split.positions ?? []) {
    for (const c of pos.circuits ?? []) {
      if (c.url) return c.url;
    }
  }
  return null;
}
