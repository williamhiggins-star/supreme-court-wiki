/**
 * write.ts — dual-write helpers: syncs the entities each daily pipeline
 * script already writes to data/*.json into the SD Supabase schema too.
 *
 * Phase 3 (SUPABASE_PLAN.md): dual-write, not cutover. data/*.json stays
 * the source of truth the site renders from; this is purely additive.
 * Every mapping decision here mirrors scripts/backfill-db.ts (the Phase 2
 * one-time backfill) exactly — same statute routing, same vote-conflict
 * tie-break, same date sanity check — see constants.ts's header for why.
 *
 * Idempotency: unlike the one-time backfill, these scripts run daily and
 * can touch the same case/split/article more than once over time. Tables
 * with a real unique key (cases.slug, statutes.slug, circuit_splits.slug,
 * publications.url, legal_terms.slug) use upsert. Tables with no natural
 * key (opinions, votes' dependents like opinion_joins, key_exchanges,
 * citations, case_terms, split_positions) use delete-then-insert scoped
 * to the one case/split just synced, so reruns never accumulate
 * duplicates.
 *
 * Every function is non-fatal-safe from the CALLER's perspective (they
 * throw on real errors — callers decide whether a sync failure should
 * block anything; the convention followed by every script wiring this in
 * is "log and continue", matching sync-to-supabase.ts's existing
 * non-fatal-outbound-sync precedent — dual-write must never break the
 * data/*.json path).
 */

import { select, upsert, insert, remove } from "../supabase-sync/client.js";
import type { SupabaseCredentials } from "../supabase-sync/env.js";
import { toSlug } from "../../pipeline.js";
import type {
  CaseSummary,
  PrecedentCase,
  LegalTerm,
  CircuitSplit,
  Article,
} from "../../../src/types/index.js";
import {
  JUSTICE_KEY_TO_SLUG,
  resolveJusticeLabel,
  CIRCUIT_KEY_TO_COURT_SLUG,
  IMPACT_AREA_MAP,
  SPLIT_STATUS_MAP,
  STATUTE_CITATION_RE,
  PRECEDENT_COURT_TEXT_TO_SLUG,
} from "./constants.js";

// ---------------------------------------------------------------------------
// Id cache — courts/people are near-static; cases grow slowly. Loaded once
// per script run, kept in memory, updated as new rows are created.
// ---------------------------------------------------------------------------

export interface IdCache {
  courtIdBySlug: Map<string, string>;
  personIdBySlug: Map<string, string>;
  caseIdBySlug: Map<string, string>;
  statuteIdBySlug: Map<string, string>;
}

export async function loadIdCache(creds: SupabaseCredentials): Promise<IdCache> {
  const [courts, people, cases, statutes] = await Promise.all([
    select<{ id: string; slug: string }>(creds, "courts", "?select=id,slug"),
    select<{ id: string; slug: string }>(creds, "people", "?select=id,slug"),
    select<{ id: string; slug: string }>(creds, "cases", "?select=id,slug"),
    select<{ id: string; slug: string }>(creds, "statutes", "?select=id,slug"),
  ]);
  return {
    courtIdBySlug: new Map(courts.map((c) => [c.slug, c.id])),
    personIdBySlug: new Map(people.map((p) => [p.slug, p.id])),
    caseIdBySlug: new Map(cases.map((c) => [c.slug, c.id])),
    statuteIdBySlug: new Map(statutes.map((s) => [s.slug, s.id])),
  };
}

function log(msg: string): void {
  console.log(`[sd-db] ${msg}`);
}

// ---------------------------------------------------------------------------
// ensureCircuitCaseStub — shared by circuit-splits and appellate-impacts
// sync, same as backfill-db.ts's version but writes immediately instead of
// accumulating into an in-memory model.
// ---------------------------------------------------------------------------

export async function ensureCircuitCaseStub(
  creds: SupabaseCredentials,
  cache: IdCache,
  args: { caseName: string; year: number; url: string; circuitKey: string; date?: string | null },
): Promise<string> {
  const slug = toSlug(`${args.caseName} ${args.year}`);
  const existing = cache.caseIdBySlug.get(slug);
  if (existing) return existing;

  const courtSlug = CIRCUIT_KEY_TO_COURT_SLUG[args.circuitKey] ?? "scotus";
  const courtId = cache.courtIdBySlug.get(courtSlug) ?? cache.courtIdBySlug.get("scotus");
  const rows = await upsert<{ id: string; slug: string }>(creds, "cases", [{
    slug,
    court_id: courtId,
    docket_number: null,
    caption: args.caseName,
    term: String(args.year),
    status: "stub",
    question_presented: null,
    background: null,
    significance: null,
    argued_date: null,
    decided_date: args.date ?? null,
    vote_line: null,
    source_urls: [args.url],
    is_stub: true,
  }], "slug");
  const id = rows[0].id;
  cache.caseIdBySlug.set(slug, id);
  return id;
}

// ---------------------------------------------------------------------------
// syncCase — the case row + its full dependent graph (opinions, votes,
// opinion_joins, key_exchanges, citations, case_terms). Called by
// update-cases.ts (new/promoted/decided cases) and fetch-opinion-authors.ts
// (author/summary/join updates to an existing case).
// ---------------------------------------------------------------------------

export interface SyncCaseResult {
  caseId: string;
  warnings: string[];
}

export async function syncCase(creds: SupabaseCredentials, cache: IdCache, c: CaseSummary): Promise<SyncCaseResult> {
  const warnings: string[] = [];

  // Same status derivation as backfill-db.ts's deriveStatus.
  const status = deriveStatus(c);

  // Same date-sanity fix as backfill-db.ts (found via a real constraint
  // violation on 25-5146-ahmad-abouammo-v-united-states).
  let argued_date = c.argumentDate || null;
  if (argued_date && c.decisionDate && c.decisionDate < argued_date) {
    warnings.push(`argumentDate (${argued_date}) is after decisionDate (${c.decisionDate}) — dropped argued_date.`);
    argued_date = null;
  }

  const [caseRow] = await upsert<{ id: string; slug: string }>(creds, "cases", [{
    slug: c.slug,
    court_id: cache.courtIdBySlug.get("scotus"),
    docket_number: c.caseNumber,
    caption: c.title,
    term: c.termYear,
    status,
    question_presented: c.legalQuestion,
    background: c.backgroundAndFacts,
    significance: c.significance,
    argued_date,
    decided_date: c.decisionDate ?? null,
    vote_line: null,
    source_urls: [c.transcriptUrl].filter(Boolean),
    is_stub: false,
  }], "slug");
  const caseId = caseRow.id;
  cache.caseIdBySlug.set(c.slug, caseId);

  // ---- opinions + votes + opinion_joins (same extraction as backfill-db.ts) ----
  interface OpinionRow { kind: string; author_person_slug: string | null; summary: string | null }
  interface VoteRow { person_slug: string; side: string }
  interface JoinRow { opinion_kind: string; opinion_author_slug: string; joiner_person_slug: string }

  const opinions: OpinionRow[] = [];
  const votesRaw: VoteRow[] = [];
  const joinsRaw: JoinRow[] = [];

  if (c.majorityAuthor) {
    if (c.majorityAuthor === "per_curiam") {
      opinions.push({ kind: "per_curiam", author_person_slug: null, summary: c.majorityOpinionSummary ?? null });
    } else {
      const slug = JUSTICE_KEY_TO_SLUG[c.majorityAuthor];
      if (!slug) {
        warnings.push(`unrecognized majorityAuthor key "${c.majorityAuthor}".`);
      } else {
        opinions.push({ kind: "majority", author_person_slug: slug, summary: c.majorityOpinionSummary ?? null });
        votesRaw.push({ person_slug: slug, side: "majority" });
        for (const joinerKey of c.majorityJoinedBy ?? []) {
          const joinerSlug = JUSTICE_KEY_TO_SLUG[joinerKey];
          if (!joinerSlug) { warnings.push(`unrecognized majorityJoinedBy key "${joinerKey}".`); continue; }
          votesRaw.push({ person_slug: joinerSlug, side: "majority" });
          joinsRaw.push({ opinion_kind: "majority", opinion_author_slug: slug, joiner_person_slug: joinerSlug });
        }
      }
    }
  }

  const concurrenceSummaryAuthors = new Set((c.concurringSummaries ?? []).map((s) => s.author));
  for (const s of c.concurringSummaries ?? []) {
    const slug = JUSTICE_KEY_TO_SLUG[s.author];
    if (!slug) { warnings.push(`unrecognized concurrence author key "${s.author}".`); continue; }
    opinions.push({ kind: "concurrence", author_person_slug: slug, summary: s.summary });
    votesRaw.push({ person_slug: slug, side: "majority" });
    for (const joinerKey of s.joinedBy ?? []) {
      const joinerSlug = JUSTICE_KEY_TO_SLUG[joinerKey];
      if (!joinerSlug) { warnings.push(`unrecognized concurrence joinedBy key "${joinerKey}".`); continue; }
      votesRaw.push({ person_slug: joinerSlug, side: "majority" });
      joinsRaw.push({ opinion_kind: "concurrence", opinion_author_slug: slug, joiner_person_slug: joinerSlug });
    }
  }
  for (const key of c.concurrenceAuthors ?? []) {
    if (concurrenceSummaryAuthors.has(key)) continue;
    const slug = JUSTICE_KEY_TO_SLUG[key];
    if (!slug) { warnings.push(`unrecognized concurrenceAuthors key "${key}".`); continue; }
    opinions.push({ kind: "concurrence", author_person_slug: slug, summary: null });
    votesRaw.push({ person_slug: slug, side: "majority" });
  }

  const dissentSummaryAuthors = new Set((c.dissentSummaries ?? []).map((s) => s.author));
  for (const s of c.dissentSummaries ?? []) {
    const slug = JUSTICE_KEY_TO_SLUG[s.author];
    if (!slug) { warnings.push(`unrecognized dissent author key "${s.author}".`); continue; }
    opinions.push({ kind: "dissent", author_person_slug: slug, summary: s.summary });
    votesRaw.push({ person_slug: slug, side: "dissent" });
    for (const joinerKey of s.joinedBy ?? []) {
      const joinerSlug = JUSTICE_KEY_TO_SLUG[joinerKey];
      if (!joinerSlug) { warnings.push(`unrecognized dissent joinedBy key "${joinerKey}".`); continue; }
      votesRaw.push({ person_slug: joinerSlug, side: "dissent" });
      joinsRaw.push({ opinion_kind: "dissent", opinion_author_slug: slug, joiner_person_slug: joinerSlug });
    }
  }
  for (const key of c.dissentAuthors ?? []) {
    if (dissentSummaryAuthors.has(key)) continue;
    const slug = JUSTICE_KEY_TO_SLUG[key];
    if (!slug) { warnings.push(`unrecognized dissentAuthors key "${key}".`); continue; }
    opinions.push({ kind: "dissent", author_person_slug: slug, summary: null });
    votesRaw.push({ person_slug: slug, side: "dissent" });
  }

  // Vote dedup + tie-break: dissent beats majority on conflict (a filed/
  // joined dissent is a more specific match than a swept-up "joined"
  // clause) — same policy as backfill-db.ts, found necessary by real
  // partial-join/partial-dissent cases during that backfill.
  const SIDE_PRIORITY: Record<string, number> = { dissent: 2, majority: 1 };
  const votesBySlug = new Map<string, VoteRow>();
  for (const v of votesRaw) {
    const existing = votesBySlug.get(v.person_slug);
    if (!existing) votesBySlug.set(v.person_slug, v);
    else if (existing.side !== v.side) {
      const winner = SIDE_PRIORITY[v.side] > SIDE_PRIORITY[existing.side] ? v : existing;
      votesBySlug.set(v.person_slug, winner);
      warnings.push(`${v.person_slug} had conflicting vote sides — kept "${winner.side}".`);
    }
  }

  const JOIN_KIND_TO_SIDE: Record<string, string> = { majority: "majority", concurrence: "majority", dissent: "dissent" };
  const seenJoinKeys = new Set<string>();
  const joins = joinsRaw.filter((j) => {
    const key = `${j.opinion_kind}::${j.opinion_author_slug}::${j.joiner_person_slug}`;
    if (seenJoinKeys.has(key)) return false;
    seenJoinKeys.add(key);
    const resolvedVote = votesBySlug.get(j.joiner_person_slug);
    if (resolvedVote && resolvedVote.side !== JOIN_KIND_TO_SIDE[j.opinion_kind]) return false;
    return true;
  });

  // ---- key_exchanges ----
  interface KeyExchangeRow { justice_person_slug: string | null; exchange: string; significance: string | null }
  const keyExchanges: KeyExchangeRow[] = [];
  for (const p of c.parties) {
    for (const ex of p.keyExchanges ?? []) {
      const justiceKey = resolveJusticeLabel(ex.justice);
      keyExchanges.push({
        justice_person_slug: justiceKey ? JUSTICE_KEY_TO_SLUG[justiceKey] : null,
        exchange: ex.question,
        significance: [ex.context, ex.significance].filter(Boolean).join(" "),
      });
      if (!justiceKey) warnings.push(`could not resolve key_exchanges justice label "${ex.justice}".`);
    }
  }

  // ---- citations (split into citations vs statute_citations) ----
  interface CitationRow { cited_case_slug: string; treatment: string; context: string | null }
  const citations: CitationRow[] = [];
  const statuteCitations: { statute_slug: string; context: string | null }[] = [];
  for (const cp of c.citedPrecedents) {
    if (cache.statuteIdBySlug.has(cp.caseSlug)) {
      statuteCitations.push({ statute_slug: cp.caseSlug, context: cp.reasonCited });
    } else {
      citations.push({ cited_case_slug: cp.caseSlug, treatment: "cited", context: cp.reasonCited });
    }
  }

  // ---- case_terms ----
  const termSlugs = c.legalTermsUsed ?? [];

  // ---- Write: delete old dependent rows for this case, then insert fresh. ----
  await Promise.all([
    remove(creds, "opinions", `case_id=eq.${caseId}`), // cascades opinion_joins
    remove(creds, "votes", `case_id=eq.${caseId}`),
    remove(creds, "key_exchanges", `case_id=eq.${caseId}`),
    remove(creds, "citations", `citing_case_id=eq.${caseId}`),
    remove(creds, "statute_citations", `citing_case_id=eq.${caseId}`),
    remove(creds, "case_terms", `case_id=eq.${caseId}`),
  ]);

  const opinionIdByKey = new Map<string, string>();
  if (opinions.length > 0) {
    const inserted = await insert<{ id: string }>(creds, "opinions", opinions.map((o) => ({
      case_id: caseId,
      kind: o.kind,
      author_id: o.author_person_slug ? cache.personIdBySlug.get(o.author_person_slug) : null,
      summary: o.summary,
    })));
    opinions.forEach((o, i) => {
      opinionIdByKey.set(`${o.kind}::${o.author_person_slug ?? "null"}`, inserted[i].id);
    });
  }

  if (joins.length > 0) {
    const joinRows = joins
      .map((j) => ({
        opinion_id: opinionIdByKey.get(`${j.opinion_kind}::${j.opinion_author_slug}`),
        person_id: cache.personIdBySlug.get(j.joiner_person_slug),
      }))
      .filter((r) => r.opinion_id && r.person_id);
    await insert(creds, "opinion_joins", joinRows);
  }

  if (votesBySlug.size > 0) {
    const voteRows = [...votesBySlug.values()]
      .map((v) => ({ case_id: caseId, person_id: cache.personIdBySlug.get(v.person_slug), side: v.side }))
      .filter((r) => r.person_id);
    await upsert(creds, "votes", voteRows, "case_id,person_id");
  }

  if (keyExchanges.length > 0) {
    await insert(creds, "key_exchanges", keyExchanges.map((k) => ({
      case_id: caseId,
      justice_id: k.justice_person_slug ? cache.personIdBySlug.get(k.justice_person_slug) : null,
      advocate_id: null,
      exchange: k.exchange,
      significance: k.significance,
    })));
  }

  if (citations.length > 0) {
    const rows = citations
      .map((cit) => ({ citing_case_id: caseId, cited_case_id: cache.caseIdBySlug.get(cit.cited_case_slug), treatment: cit.treatment, context: cit.context }))
      .filter((r) => r.cited_case_id);
    const missing = citations.length - rows.length;
    if (missing > 0) warnings.push(`${missing} citation(s) reference a case slug not yet in the DB — skipped (will resolve once that case syncs).`);
    if (rows.length > 0) await insert(creds, "citations", rows);
  }

  if (statuteCitations.length > 0) {
    const rows = statuteCitations
      .map((s) => ({ citing_case_id: caseId, statute_id: cache.statuteIdBySlug.get(s.statute_slug), context: s.context }))
      .filter((r) => r.statute_id);
    if (rows.length > 0) await insert(creds, "statute_citations", rows);
  }

  if (termSlugs.length > 0) {
    const termRows = await select<{ id: string; slug: string }>(creds, "legal_terms", `?slug=in.(${termSlugs.join(",")})&select=id,slug`);
    const termIdBySlug = new Map(termRows.map((t) => [t.slug, t.id]));
    const rows = termSlugs
      .map((slug) => ({ case_id: caseId, term_id: termIdBySlug.get(slug) }))
      .filter((r) => r.term_id);
    if (rows.length > 0) await insert(creds, "case_terms", rows);
  }

  return { caseId, warnings };
}

/** Same status derivation as the frontend (src/app/page.tsx's
 *  getDocketStatus) and backfill-db.ts's deriveStatus. */
function deriveStatus(c: CaseSummary): string {
  if (c.docketStatus === "decided") return "decided";
  if (c.docketStatus === "petition") return "petition";
  if (c.docketStatus === "upcoming") return "upcoming";
  if (c.outcome) return "decided";
  if (!c.argumentDate) return "upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = c.argumentDate.split("-").map(Number);
  const argDate = new Date(y, m - 1, d);
  if (argDate > today) return "upcoming";
  return "argued";
}

// ---------------------------------------------------------------------------
// syncNewTerm / syncNewPrecedent — side effects of processing a transcript
// (pipeline.ts's saveResult() may create new term/precedent stub files).
// ---------------------------------------------------------------------------

export async function syncNewTerm(creds: SupabaseCredentials, t: LegalTerm): Promise<void> {
  await upsert(creds, "legal_terms", [{ slug: t.slug, term: t.term, definition: t.definition }], "slug");
}

export async function syncNewPrecedent(creds: SupabaseCredentials, cache: IdCache, p: PrecedentCase): Promise<void> {
  const isStatute = STATUTE_CITATION_RE.test(p.citation ?? "");
  if (isStatute) {
    const [row] = await upsert<{ id: string; slug: string }>(creds, "statutes", [{
      slug: p.slug, citation: p.citation, name: p.name, jurisdiction: "federal", url: null,
    }], "slug");
    cache.statuteIdBySlug.set(p.slug, row.id);
    return;
  }
  const enriched = "holding" in p && p.holding !== undefined;
  const courtSlug = p.court ? PRECEDENT_COURT_TEXT_TO_SLUG[p.court] : undefined;
  const [row] = await upsert<{ id: string; slug: string }>(creds, "cases", [{
    slug: p.slug,
    court_id: cache.courtIdBySlug.get(courtSlug ?? "scotus"),
    docket_number: null,
    caption: p.name,
    term: String(p.year),
    status: enriched ? "historic" : "stub",
    question_presented: p.legalQuestion ?? null,
    background: p.backgroundAndFacts ?? null,
    significance: p.significance,
    argued_date: null,
    decided_date: null,
    vote_line: p.voteCount ?? null,
    source_urls: [],
    is_stub: !enriched,
  }], "slug");
  cache.caseIdBySlug.set(p.slug, row.id);
}

// ---------------------------------------------------------------------------
// syncCircuitSplits — full resync of the current circuit-splits.json
// content. NOTE this is NOT a strict merge: fetch-circuit-splits.ts only
// explicitly preserves SCOTUS-linked splits across runs (by slug); a
// non-SCOTUS-linked split from a previous run that Claude doesn't
// regenerate with the same slug today just silently drops out of the
// JSON's own output. Found via a real parity-check mismatch during Phase
// 3 testing (5 orphaned rows) — upserting without pruning left the DB
// holding splits the JSON no longer mentions at all. Prunes any
// circuit_splits row whose slug isn't in the current set, same pattern as
// syncArticles's stale-publication pruning. split_positions cascades on
// delete, so no separate cleanup needed there.
// ---------------------------------------------------------------------------

export async function syncCircuitSplits(creds: SupabaseCredentials, cache: IdCache, splits: CircuitSplit[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const s of splits) {
    const status = SPLIT_STATUS_MAP[s.status];
    if (!status) { warnings.push(`circuit split ${s.id}: unrecognized status "${s.status}".`); continue; }

    let scotusCaseId: string | null = null;
    if (s.relatedScotusSlug) {
      scotusCaseId = cache.caseIdBySlug.get(s.relatedScotusSlug) ?? null;
      if (!scotusCaseId) warnings.push(`circuit split ${s.id}: relatedScotusSlug "${s.relatedScotusSlug}" not found in cases — left null.`);
    }

    const [splitRow] = await upsert<{ id: string; slug: string }>(creds, "circuit_splits", [{
      slug: s.id, question: s.legalQuestion, status, scotus_case_id: scotusCaseId,
    }], "slug");
    const splitId = splitRow.id;

    await remove(creds, "split_positions", `split_id=eq.${splitId}`);
    const positionRows: { split_id: string; case_id: string; position: string }[] = [];
    for (const pos of s.positions) {
      for (const c of pos.circuits) {
        const caseId = await ensureCircuitCaseStub(creds, cache, { caseName: c.caseName, year: c.year, url: c.url, circuitKey: c.key });
        positionRows.push({ split_id: splitId, case_id: caseId, position: pos.label });
      }
    }
    if (positionRows.length > 0) await insert(creds, "split_positions", positionRows);
  }

  const currentSlugs = new Set(splits.map((s) => s.id));
  const existing = await select<{ id: string; slug: string }>(creds, "circuit_splits", "?select=id,slug");
  const stale = existing.filter((r) => !currentSlugs.has(r.slug));
  if (stale.length > 0) {
    await remove(creds, "circuit_splits", `id=in.(${stale.map((r) => r.id).join(",")})`);
  }

  log(`circuit_splits: synced ${splits.length} (${stale.length} pruned)`);
  return warnings;
}

// ---------------------------------------------------------------------------
// syncAppellateImpacts — appellate-impacts.json is a full replace each run
// (not merged like articles/splits), so the DB mirrors that: delete all,
// insert fresh.
// ---------------------------------------------------------------------------

export interface AppellateImpactInput {
  id: string; caseName: string; docketNumber?: string; courtKey?: string; date?: string;
  area?: string; legalQuestion?: string; description?: string;
  positiveImplications?: string; negativeImplications?: string; url?: string;
}

export async function syncAppellateImpacts(creds: SupabaseCredentials, cache: IdCache, impacts: AppellateImpactInput[]): Promise<string[]> {
  const warnings: string[] = [];
  await remove(creds, "appellate_impacts", "id=not.is.null"); // full replace

  const rows: Record<string, unknown>[] = [];
  for (const i of impacts) {
    const year = i.date ? Number(i.date.slice(0, 4)) : new Date().getFullYear();
    const caseId = await ensureCircuitCaseStub(creds, cache, {
      caseName: i.caseName, year, url: i.url ?? "", circuitKey: i.courtKey ?? "", date: i.date,
    });
    const impactArea = i.area ? IMPACT_AREA_MAP[i.area] : undefined;
    if (!impactArea) { warnings.push(`appellate impact "${i.id}": unrecognized area "${i.area}".`); continue; }

    const positiveIsNone = /none significant/i.test(i.positiveImplications ?? "");
    const negativeIsNone = /none significant/i.test(i.negativeImplications ?? "");
    let direction: string;
    if (positiveIsNone && !negativeIsNone) direction = "business_adverse";
    else if (negativeIsNone && !positiveIsNone) direction = "business_favorable";
    else direction = "mixed";

    const writeup = [i.description, i.positiveImplications ? `Positive: ${i.positiveImplications}` : null, i.negativeImplications ? `Negative: ${i.negativeImplications}` : null]
      .filter(Boolean).join("\n\n");

    rows.push({ case_id: caseId, impact_area: impactArea, direction, writeup });
  }
  if (rows.length > 0) await insert(creds, "appellate_impacts", rows);
  log(`appellate_impacts: synced ${rows.length}`);
  return warnings;
}

// ---------------------------------------------------------------------------
// syncArticles — articles.json is a merge (dedup + prune by cutoff), so
// "the same data" is the whole current article set: upsert all, then
// delete any journalism-kind publication no longer present (pruned).
// ---------------------------------------------------------------------------

export async function syncArticles(creds: SupabaseCredentials, cache: IdCache, articles: Article[]): Promise<void> {
  const rows = articles.map((a) => ({
    url: a.url, kind: "journalism", title: a.title, author_text: a.author ?? null, published_at: a.publishedAt, summary: a.summary,
  }));
  if (rows.length > 0) await upsert(creds, "publications", rows, "url");

  const existingUrls = await select<{ url: string; id: string }>(creds, "publications", "?kind=eq.journalism&select=url,id");
  const currentUrls = new Set(articles.map((a) => a.url));
  const stale = existingUrls.filter((r) => !currentUrls.has(r.url));
  if (stale.length > 0) {
    await remove(creds, "publications", `id=in.(${stale.map((r) => r.id).join(",")})`);
  }

  const pubRows = await select<{ url: string; id: string }>(creds, "publications", "?kind=eq.journalism&select=url,id");
  const pubIdByUrl = new Map(pubRows.map((r) => [r.url, r.id]));
  for (const a of articles) {
    const pubId = pubIdByUrl.get(a.url);
    if (!pubId) continue;
    await remove(creds, "publication_cases", `publication_id=eq.${pubId}`);
    const caseRows = a.relatedCaseSlugs
      .map((slug) => ({ publication_id: pubId, case_id: cache.caseIdBySlug.get(slug) }))
      .filter((r) => r.case_id);
    if (caseRows.length > 0) await insert(creds, "publication_cases", caseRows);
  }
  log(`publications: synced ${rows.length} (${stale.length} pruned)`);
}

// ---------------------------------------------------------------------------
// syncJusticeStats / syncLawyerStats — full replace each run, matching how
// data/justices.json and data/lawyers.json are themselves fully
// recomputed from scratch each time (not merged). lawyer stats also syncs
// case_participations (per sign-off: continues sourcing advocate names
// from data/lawyers.json, same as the Phase 2 backfill).
// ---------------------------------------------------------------------------

export interface JusticeStatEntry {
  key: string;
  questions: number;
  totalWords: number;
  estimatedMinutes: number;
  casesParticipated: number;
  majorityOpinions: number;
  concurrences: number;
  dissents: number;
}

export async function syncJusticeStats(creds: SupabaseCredentials, cache: IdCache, term: string, justices: JusticeStatEntry[]): Promise<string[]> {
  const warnings: string[] = [];
  await remove(creds, "justice_stats", `term=eq.${term}`);
  const rows: Record<string, unknown>[] = [];
  for (const j of justices) {
    const slug = JUSTICE_KEY_TO_SLUG[j.key];
    const personId = slug ? cache.personIdBySlug.get(slug) : undefined;
    if (!personId) { warnings.push(`justice_stats: unresolved key "${j.key}".`); continue; }
    rows.push({
      term, person_id: personId,
      questions: j.questions, total_words: j.totalWords, estimated_minutes: j.estimatedMinutes,
      cases_participated: j.casesParticipated, majority_opinions: j.majorityOpinions,
      concurrences: j.concurrences, dissents: j.dissents,
    });
  }
  if (rows.length > 0) await insert(creds, "justice_stats", rows);
  log(`justice_stats: synced ${rows.length} for term ${term}`);
  return warnings;
}

export interface LawyerStatEntry {
  label: string;
  name: string;
  totalWords: number;
  estimatedMinutes: number;
  casesArgued: number;
  wins: number;
  losses: number;
  cases: Array<{ slug: string; side?: "petitioner" | "respondent" }>;
}

export async function syncLawyerStats(
  creds: SupabaseCredentials,
  cache: IdCache,
  term: string,
  lawyers: LawyerStatEntry[],
  cases: CaseSummary[],
): Promise<string[]> {
  const warnings: string[] = [];
  const caseBySlug = new Map(cases.map((c) => [c.slug, c]));

  // Ensure a people row exists for every advocate (same pattern as
  // backfill-db.ts's buildFromLawyers — full_name is the informal
  // courtroom label, not a verified full legal name; flagged there too).
  const personRows = lawyers.map((l) => ({ slug: toSlug(l.label), full_name: l.name }));
  if (personRows.length > 0) {
    const upserted = await upsert<{ id: string; slug: string }>(creds, "people", personRows, "slug");
    for (const r of upserted) cache.personIdBySlug.set(r.slug, r.id);
  }

  await remove(creds, "lawyer_stats", `term=eq.${term}`);
  const statRows = lawyers.map((l) => ({
    term, label: l.label, person_id: cache.personIdBySlug.get(toSlug(l.label)) ?? null, name: l.name,
    total_words: l.totalWords, estimated_minutes: l.estimatedMinutes,
    cases_argued: l.casesArgued, wins: l.wins, losses: l.losses,
  }));
  if (statRows.length > 0) await insert(creds, "lawyer_stats", statRows);

  // case_participations — full replace for every case any lawyer argued.
  const touchedCaseSlugs = new Set<string>();
  for (const l of lawyers) for (const c of l.cases) touchedCaseSlugs.add(c.slug);
  for (const slug of touchedCaseSlugs) {
    const caseId = cache.caseIdBySlug.get(slug);
    if (caseId) await remove(creds, "case_participations", `case_id=eq.${caseId}`);
  }

  const participationRows: Record<string, unknown>[] = [];
  for (const l of lawyers) {
    const personId = cache.personIdBySlug.get(toSlug(l.label));
    if (!personId) continue;
    for (const cs of l.cases) {
      const caseId = cache.caseIdBySlug.get(cs.slug);
      const caseData = caseBySlug.get(cs.slug);
      if (!caseId) { warnings.push(`case_participations: "${l.name}" case "${cs.slug}" not found in cases — skipped.`); continue; }
      const role = cs.side === "petitioner" ? "argued_petitioner" : cs.side === "respondent" ? "argued_respondent" : "on_brief";
      const partyName = caseData?.parties.find((p) => p.role === cs.side)?.party ?? null;
      participationRows.push({ case_id: caseId, person_id: personId, role, party_name: partyName });
    }
  }
  if (participationRows.length > 0) await insert(creds, "case_participations", participationRows);
  log(`lawyer_stats: synced ${lawyers.length}, case_participations: ${participationRows.length}`);
  return warnings;
}
