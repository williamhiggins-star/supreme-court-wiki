/**
 * mappers.ts — the SINGLE source of truth for dashboard → Supabase field mapping.
 *
 * Shared by both scripts/sync-to-supabase.ts (daily) and
 * scripts/backfill-supabase.ts (one-time). There is exactly one mapping
 * implementation so the backfill and the daily sync can never drift.
 *
 * Idempotency: each mapper computes a sha256 content hash of the committed
 * source record and stores it inside the row (raw._sync.content_hash for
 * cases/splits, metadata._sync.content_hash for articles). run.ts compares the
 * fresh hash to the stored one and skips unchanged rows.
 */

import type {
  CaseSummary,
  CircuitSplit,
  Article,
} from "../../../src/types/index.js";
import { contentHash } from "./hash.js";

export interface MappedRow {
  /** upsert key value (slug for cases/splits, url for articles) */
  key: string;
  /** full upsert payload (columns) */
  row: Record<string, unknown>;
  /** sha256 of the committed source record */
  hash: string;
}

/** Normalise a loose date string to YYYY-MM-DD, or null. */
function toDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function caseSourceUrl(c: CaseSummary): string | null {
  if (c.transcriptUrl) return c.transcriptUrl;
  if (c.caseNumber) {
    return `https://www.supremecourt.gov/docket/docketfiles/html/public/${c.caseNumber}.html`;
  }
  return null;
}

/** Total number of circuits across all positions — used as split "depth". */
export function splitDepth(split: CircuitSplit): number {
  return (split.positions ?? []).reduce(
    (n, p) => n + (p.circuits?.length ?? 0),
    0,
  );
}

/** Distinct circuit keys referenced by a split (order-preserving). */
export function splitCircuitKeys(split: CircuitSplit): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pos of split.positions ?? []) {
    for (const c of pos.circuits ?? []) {
      if (c.key && !seen.has(c.key)) {
        seen.add(c.key);
        out.push(c.key);
      }
    }
  }
  return out;
}

function splitSourceUrl(split: CircuitSplit): string | null {
  for (const pos of split.positions ?? []) {
    for (const c of pos.circuits ?? []) {
      if (c.url) return c.url;
    }
  }
  return null;
}

// ── scotus_cases ─────────────────────────────────────────────────────────────

export function mapCase(c: CaseSummary): MappedRow {
  const hash = contentHash(c);
  const row: Record<string, unknown> = {
    slug: c.slug,
    name: c.title,
    docket_number: c.caseNumber ?? null,
    term: c.termYear ?? null,
    status: c.docketStatus ?? null,
    question_presented: c.legalQuestion ?? null,
    summary: c.significance || c.backgroundAndFacts || null,
    holding: c.majorityOpinionSummary ?? null,
    argued_date: toDate(c.argumentDate),
    decided_date: toDate(c.decisionDate),
    outcome: c.outcome ?? null,
    source_url: caseSourceUrl(c),
    raw: {
      ...c,
      _sync: { content_hash: hash, synced_at: new Date().toISOString() },
    },
  };
  return { key: c.slug, row, hash };
}

// ── scotus_circuit_splits ────────────────────────────────────────────────────

export function mapSplit(split: CircuitSplit): MappedRow {
  const hash = contentHash(split);
  const row: Record<string, unknown> = {
    slug: split.id,
    question: split.legalQuestion,
    summary: split.description ?? null,
    positions: split.positions ?? [],
    status: split.status ?? null,
    depth: splitDepth(split),
    related_case_slug: split.relatedScotusSlug ?? null,
    source_url: splitSourceUrl(split),
    raw: {
      ...split,
      _sync: { content_hash: hash, synced_at: new Date().toISOString() },
    },
  };
  return { key: split.id, row, hash };
}

// ── raw_articles ─────────────────────────────────────────────────────────────

export function mapArticle(a: Article): MappedRow {
  const hash = contentHash(a);
  const row: Record<string, unknown> = {
    url: a.url,
    title: a.title,
    summary: a.summary ?? null,
    author: a.author ?? null,
    published_at: toDate(a.publishedAt),
    source_id: null,
    metadata: {
      source: "scotusdashboard",
      feed: a.source ?? null,
      related_case_slugs: a.relatedCaseSlugs ?? [],
      _sync: { content_hash: hash, synced_at: new Date().toISOString() },
    },
  };
  return { key: a.url, row, hash };
}

/** Extract the stored content hash from a prior scotus_cases / scotus_circuit_splits row. */
export function priorHashFromRaw(raw: unknown): string | null {
  const r = raw as { _sync?: { content_hash?: string } } | null | undefined;
  return r?._sync?.content_hash ?? null;
}

/** Extract the stored content hash from a prior raw_articles row. */
export function priorHashFromMetadata(metadata: unknown): string | null {
  const m = metadata as { _sync?: { content_hash?: string } } | null | undefined;
  return m?._sync?.content_hash ?? null;
}
