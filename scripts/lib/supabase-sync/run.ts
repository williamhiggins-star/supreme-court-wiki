/**
 * run.ts — the shared orchestration used by BOTH scripts/sync-to-supabase.ts
 * (daily, non-fatal) and scripts/backfill-supabase.ts (one-time). There is one
 * implementation of the flow so daily sync and backfill can never diverge.
 *
 * Flow:
 *   1. load committed dashboard JSON (source of truth)
 *   2. map to Supabase payloads (+ content hash)
 *   3. FETCH PRIOR STATE from Supabase (captured before any write, so event
 *      diffing compares against the pre-sync world)
 *   4. upsert only rows whose content hash changed (hash-checked idempotency)
 *   5. derive events from prior-vs-current state, using ids resolved in step 4
 *   6. insert only events that do not already exist (dedup keys)
 *
 * The daily sync passes mode:"sync"; the backfill passes mode:"backfill" (which
 * only stamps metadata.backfill=true). Both derive the same events.
 */

import type { SupabaseCredentials } from "./env.js";
import { select, upsert, insert } from "./client.js";
import {
  loadCases,
  loadSplits,
  loadArticles,
  loadAppellateImpacts,
} from "./data.js";
import { mapCase, mapSplit, mapArticle } from "./mappers.js";
import {
  deriveCaseEvents,
  deriveSplitEvents,
  deriveAppellateEvents,
  caseEventDedupKey,
  splitEventDedupKey,
  type SyncMode,
  type PriorSplit,
  type CaseEventInsert,
  type SplitEventInsert,
} from "./events.js";

export interface SyncSummary {
  casesUpserted: number;
  casesUnchanged: number;
  splitsUpserted: number;
  splitsUnchanged: number;
  articlesUpserted: number;
  articlesUnchanged: number;
  caseEventsInserted: number;
  splitEventsInserted: number;
}

interface PriorEntity {
  id: string;
  hash: string | null;
}
interface PriorSplitRow {
  id: string;
  slug: string;
  status: string | null;
  depth: number | null;
  positions: { circuits?: { key?: string }[] }[] | null;
  hash: string | null;
}

function log(msg: string): void {
  console.log(`[sync] ${msg}`);
}

export async function runSync(
  creds: SupabaseCredentials,
  mode: SyncMode,
): Promise<SyncSummary> {
  const cases = loadCases();
  const splits = loadSplits();
  const articles = loadArticles();
  const impacts = loadAppellateImpacts();
  log(
    `loaded ${cases.length} cases, ${splits.length} splits, ${articles.length} articles, ${impacts.length} appellate impacts (mode=${mode})`,
  );

  const mappedCases = cases.map(mapCase);
  const mappedSplits = splits.map(mapSplit);
  const mappedArticles = articles.map(mapArticle);

  // ── 3. Fetch prior state (before any write) ────────────────────────────────
  const priorCaseRows = await select<{
    id: string;
    slug: string;
    hash: string | null;
  }>(
    creds,
    "scotus_cases",
    "?select=id,slug,hash:raw->_sync->>content_hash",
  );
  const priorSplitRows = await select<PriorSplitRow>(
    creds,
    "scotus_circuit_splits",
    "?select=id,slug,status,depth,positions,hash:raw->_sync->>content_hash",
  );
  const priorArticleRows = await select<{ url: string; hash: string | null }>(
    creds,
    "raw_articles",
    "?select=url,hash:metadata->_sync->>content_hash",
  );
  const existingCaseEvents = await select<{
    case_id: string | null;
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>(creds, "scotus_case_events", "?select=case_id,event_type,metadata");
  const existingSplitEvents = await select<{
    split_id: string;
    event_type: string;
    circuit: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    creds,
    "scotus_split_events",
    "?select=split_id,event_type,circuit,metadata",
  );

  const priorCaseBySlug = new Map<string, PriorEntity>();
  for (const r of priorCaseRows) priorCaseBySlug.set(r.slug, { id: r.id, hash: r.hash });

  const priorSplitBySlug = new Map<string, PriorSplit & { hash: string | null }>();
  for (const r of priorSplitRows) {
    const circuitKeys: string[] = [];
    const seen = new Set<string>();
    for (const pos of r.positions ?? []) {
      for (const c of pos.circuits ?? []) {
        if (c.key && !seen.has(c.key)) {
          seen.add(c.key);
          circuitKeys.push(c.key);
        }
      }
    }
    priorSplitBySlug.set(r.slug, {
      id: r.id,
      status: r.status,
      depth: r.depth,
      circuitKeys,
      hash: r.hash,
    });
  }

  const priorArticleHashByUrl = new Map<string, string | null>();
  for (const r of priorArticleRows) priorArticleHashByUrl.set(r.url, r.hash);

  const existingCaseEventKeys = new Set(existingCaseEvents.map(caseEventDedupKey));
  const existingSplitEventKeys = new Set(
    existingSplitEvents.map(splitEventDedupKey),
  );

  // ── 4. Upsert changed entities, resolving ids for every slug ───────────────
  const caseIdBySlug = new Map<string, string>();
  for (const [slug, p] of priorCaseBySlug) caseIdBySlug.set(slug, p.id);
  const splitIdBySlug = new Map<string, string>();
  for (const [slug, p] of priorSplitBySlug) splitIdBySlug.set(slug, p.id);

  const changedCases = mappedCases.filter(
    (m) => priorCaseBySlug.get(m.key)?.hash !== m.hash,
  );
  const upsertedCases = await upsert<{ id: string; slug: string }>(
    creds,
    "scotus_cases",
    changedCases.map((m) => m.row),
    "slug",
  );
  for (const r of upsertedCases) caseIdBySlug.set(r.slug, r.id);

  const changedSplits = mappedSplits.filter(
    (m) => priorSplitBySlug.get(m.key)?.hash !== m.hash,
  );
  const upsertedSplits = await upsert<{ id: string; slug: string }>(
    creds,
    "scotus_circuit_splits",
    changedSplits.map((m) => m.row),
    "slug",
  );
  for (const r of upsertedSplits) splitIdBySlug.set(r.slug, r.id);

  const changedArticles = mappedArticles.filter(
    (m) => priorArticleHashByUrl.get(m.key) !== m.hash,
  );
  const upsertedArticles = await upsert(
    creds,
    "raw_articles",
    changedArticles.map((m) => m.row),
    "url",
  );

  // ── 5. Derive events (uses prior state + resolved ids) ─────────────────────
  const caseEventCandidates: CaseEventInsert[] = [];
  const splitEventCandidates: SplitEventInsert[] = [];

  for (const c of cases) {
    const id = caseIdBySlug.get(c.slug);
    if (!id) continue; // could not resolve id (upsert of this case failed to return) — skip its events
    caseEventCandidates.push(...deriveCaseEvents(c, id, mode));
  }

  for (const split of splits) {
    const id = splitIdBySlug.get(split.id);
    if (!id) continue;
    const prior = priorSplitBySlug.get(split.id);
    const { splitEvents, caseEvents } = deriveSplitEvents(split, id, prior, mode);
    splitEventCandidates.push(...splitEvents);
    caseEventCandidates.push(...caseEvents);
  }

  caseEventCandidates.push(...deriveAppellateEvents(impacts, mode));

  // ── 6. Insert only new events (dedup vs existing + within this batch) ───────
  const newCaseEvents = dedup(
    caseEventCandidates,
    caseEventDedupKey,
    existingCaseEventKeys,
  );
  const newSplitEvents = dedup(
    splitEventCandidates,
    splitEventDedupKey,
    existingSplitEventKeys,
  );

  await insert(creds, "scotus_case_events", newCaseEvents as unknown as Record<string, unknown>[]);
  await insert(
    creds,
    "scotus_split_events",
    newSplitEvents as unknown as Record<string, unknown>[],
  );

  const summary: SyncSummary = {
    casesUpserted: upsertedCases.length,
    casesUnchanged: mappedCases.length - changedCases.length,
    splitsUpserted: upsertedSplits.length,
    splitsUnchanged: mappedSplits.length - changedSplits.length,
    articlesUpserted: upsertedArticles.length,
    articlesUnchanged: mappedArticles.length - changedArticles.length,
    caseEventsInserted: newCaseEvents.length,
    splitEventsInserted: newSplitEvents.length,
  };

  log(
    `cases: +${summary.casesUpserted} / ${summary.casesUnchanged} unchanged | ` +
      `splits: +${summary.splitsUpserted} / ${summary.splitsUnchanged} unchanged | ` +
      `articles: +${summary.articlesUpserted} / ${summary.articlesUnchanged} unchanged`,
  );
  log(
    `events: +${summary.caseEventsInserted} case events, +${summary.splitEventsInserted} split events`,
  );

  return summary;
}

function dedup<T>(
  candidates: T[],
  keyOf: (t: T) => string,
  existing: Set<string>,
): T[] {
  const seen = new Set(existing);
  const out: T[] = [];
  for (const c of candidates) {
    const k = keyOf(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
