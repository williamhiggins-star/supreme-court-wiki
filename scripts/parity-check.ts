#!/usr/bin/env tsx
/**
 * parity-check.ts
 *
 * Phase 3 (SUPABASE_PLAN.md) dual-write safety net: diffs the Supabase
 * schema's contents against the freshly regenerated data/*.json for every
 * table with a JSON counterpart, and reports mismatches.
 *
 * Non-fatal by design: this is a report, not a gate. It always exits 0
 * (unless it can't reach Supabase at all) — nothing about this script
 * blocks a commit or a workflow run. Run it after any dual-write pipeline
 * run to see whether the two stores actually agree.
 *
 * Run: npx tsx scripts/parity-check.ts
 */

import * as fs from "fs";
import * as path from "path";
import { select } from "./lib/supabase-sync/client.js";
import { getCredentials } from "./lib/supabase-sync/env.js";
import { toSlug } from "./pipeline.js";
import {
  JUSTICE_KEY_TO_SLUG,
  STATUTE_CITATION_RE,
} from "./lib/sd-db/constants.js";
import type {
  CaseSummary,
  PrecedentCase,
  LegalTerm,
  ArticlesData,
  CircuitSplitsData,
} from "../src/types/index.js";

const DATA_DIR = path.join(process.cwd(), "data");

function readJsonDir<T>(dir: string): T[] {
  const full = path.join(DATA_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(full, f), "utf-8")) as T);
}
function readJsonFile<T>(file: string): T | null {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

// ---------------------------------------------------------------------------
// Report accumulator
// ---------------------------------------------------------------------------

interface TableReport {
  table: string;
  jsonExpected: number;
  dbActual: number;
  missingFromDb: string[]; // present in JSON, not in DB (by natural key)
  extraInDb: string[]; // present in DB, not in JSON
  fieldMismatches: string[]; // "<key>: <field> json=<x> db=<y>"
  /** true for tables with no natural key to diff by, where raw count
   *  equality is the only signal available. Key-based tables ignore raw
   *  count and rely on missingFromDb/extraInDb instead — those two arrays
   *  already account for legitimate, explained count differences (e.g.
   *  cases also holds circuit-opinion/dangling-citation stubs with no
   *  JSON file of their own), so requiring jsonExpected === dbActual on
   *  top of them would double-count the same signal and produce false
   *  positives. */
  countOnly?: boolean;
}

function isOk(r: TableReport): boolean {
  if (r.fieldMismatches.length > 0) return false;
  if (r.countOnly) return r.jsonExpected === r.dbActual;
  return r.missingFromDb.length === 0 && r.extraInDb.length === 0;
}

function printReport(reports: TableReport[]) {
  console.log("\n=================== PARITY CHECK REPORT ===================\n");
  const clean = reports.filter(isOk).length;
  console.log(`${clean} / ${reports.length} tables match exactly.\n`);

  for (const r of reports) {
    const ok = isOk(r);
    console.log(`-- ${r.table} ${ok ? "✓" : "✗ MISMATCH"} (json=${r.jsonExpected}, db=${r.dbActual}) --`);
    if (r.missingFromDb.length > 0) {
      console.log(`  missing from DB (${r.missingFromDb.length}): ${r.missingFromDb.slice(0, 15).join(", ")}${r.missingFromDb.length > 15 ? ", ..." : ""}`);
    }
    if (r.extraInDb.length > 0) {
      console.log(`  extra in DB (${r.extraInDb.length}): ${r.extraInDb.slice(0, 15).join(", ")}${r.extraInDb.length > 15 ? ", ..." : ""}`);
    }
    if (r.fieldMismatches.length > 0) {
      console.log(`  field mismatches (${r.fieldMismatches.length}):`);
      r.fieldMismatches.slice(0, 15).forEach((m) => console.log(`    ${m}`));
      if (r.fieldMismatches.length > 15) console.log(`    ... and ${r.fieldMismatches.length - 15} more`);
    }
  }
  console.log("\n=================== END REPORT ===================\n");
}

function diffKeys(jsonKeys: Set<string>, dbKeys: Set<string>): { missing: string[]; extra: string[] } {
  const missing = [...jsonKeys].filter((k) => !dbKeys.has(k)).sort();
  const extra = [...dbKeys].filter((k) => !jsonKeys.has(k)).sort();
  return { missing, extra };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const creds = getCredentials();
  if (!creds) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot run parity check.");
    process.exit(1);
  }

  const reports: TableReport[] = [];

  const cases = readJsonDir<CaseSummary>("cases");
  const precedents = readJsonDir<PrecedentCase>("precedents");
  const terms = readJsonDir<LegalTerm>("terms");
  const articles = readJsonFile<ArticlesData>("articles.json");
  const circuitSplits = readJsonFile<CircuitSplitsData>("circuit-splits.json");
  const justicesData = readJsonFile<{ term: string; justices: Array<{ key: string; questions: number; totalWords: number; estimatedMinutes: number; casesParticipated: number; majorityOpinions: number; concurrences: number; dissents: number }> }>("justices.json");
  const lawyersData = readJsonFile<{ term: string; lawyers: Array<{ label: string; name: string; totalWords: number; estimatedMinutes: number; casesArgued: number; wins: number; losses: number }> }>("lawyers.json");

  // ---- cases: data/cases + non-statute data/precedents (statutes routed elsewhere) ----
  const nonStatutePrecedentSlugs = new Set(precedents.filter((p) => !STATUTE_CITATION_RE.test(p.citation ?? "")).map((p) => p.slug));
  const jsonCaseSlugs = new Set([...cases.map((c) => c.slug), ...nonStatutePrecedentSlugs]);
  const dbCases = await select<{ slug: string; status: string; is_stub: boolean }>(creds, "cases", "?select=slug,status,is_stub");
  const dbCaseBySlug = new Map(dbCases.map((c) => [c.slug, c]));
  {
    const { missing, extra } = diffKeys(jsonCaseSlugs, new Set(dbCases.map((c) => c.slug)));
    // "extra" legitimately includes circuit-court stub cases (from
    // circuit_splits/appellate_impacts) and dangling-citation stubs —
    // neither has a data/cases or data/precedents file of its own. Only
    // flag extras that look like they SHOULD have a JSON file (i.e.,
    // aren't marked as stubs) as real mismatches; report the rest as an
    // informational note, not a mismatch.
    const unexplainedExtra = extra.filter((slug) => dbCaseBySlug.get(slug)?.is_stub === false);
    reports.push({
      table: "cases (data/cases + non-statute data/precedents)",
      jsonExpected: jsonCaseSlugs.size,
      dbActual: dbCases.length,
      missingFromDb: missing,
      extraInDb: unexplainedExtra,
      fieldMismatches: [],
    });
    if (extra.length > unexplainedExtra.length) {
      console.log(`(note: cases table also has ${extra.length - unexplainedExtra.length} stub rows with no JSON counterpart — circuit-opinion stubs and dangling-citation stubs, expected.)`);
    }
  }

  // ---- statutes: statute-shaped data/precedents ----
  const statutePrecedents = precedents.filter((p) => STATUTE_CITATION_RE.test(p.citation ?? ""));
  const dbStatutes = await select<{ slug: string }>(creds, "statutes", "?select=slug");
  {
    const { missing, extra } = diffKeys(new Set(statutePrecedents.map((p) => p.slug)), new Set(dbStatutes.map((s) => s.slug)));
    reports.push({ table: "statutes", jsonExpected: statutePrecedents.length, dbActual: dbStatutes.length, missingFromDb: missing, extraInDb: extra, fieldMismatches: [] });
  }

  // ---- legal_terms ----
  const dbTerms = await select<{ slug: string }>(creds, "legal_terms", "?select=slug");
  {
    const { missing, extra } = diffKeys(new Set(terms.map((t) => t.slug)), new Set(dbTerms.map((t) => t.slug)));
    reports.push({ table: "legal_terms", jsonExpected: terms.length, dbActual: dbTerms.length, missingFromDb: missing, extraInDb: extra, fieldMismatches: [] });
  }

  // ---- circuit_splits ----
  const splits = circuitSplits?.splits ?? [];
  const dbSplits = await select<{ slug: string; status: string }>(creds, "circuit_splits", "?select=slug,status");
  const dbSplitBySlug = new Map(dbSplits.map((s) => [s.slug, s.status]));
  const SPLIT_STATUS_MAP: Record<string, string> = { open: "open", scotus_pending: "cert_granted", scotus_resolved: "resolved" };
  {
    const { missing, extra } = diffKeys(new Set(splits.map((s) => s.id)), new Set(dbSplits.map((s) => s.slug)));
    const fieldMismatches: string[] = [];
    for (const s of splits) {
      const expectedStatus = SPLIT_STATUS_MAP[s.status];
      const actualStatus = dbSplitBySlug.get(s.id);
      if (actualStatus !== undefined && expectedStatus !== actualStatus) {
        fieldMismatches.push(`${s.id}: status json=${expectedStatus} db=${actualStatus}`);
      }
    }
    reports.push({ table: "circuit_splits", jsonExpected: splits.length, dbActual: dbSplits.length, missingFromDb: missing, extraInDb: extra, fieldMismatches });
  }

  // ---- appellate_impacts: count-only (no natural key — full-replace table) ----
  const impacts = readJsonFile<{ impacts: Array<{ id: string }> }>("appellate-impacts.json");
  const dbImpactsCount = (await select<{ id: string }>(creds, "appellate_impacts", "?select=id")).length;
  reports.push({
    table: "appellate_impacts (count only — no natural key)",
    jsonExpected: impacts?.impacts.length ?? 0,
    dbActual: dbImpactsCount,
    missingFromDb: [],
    extraInDb: [],
    fieldMismatches: [],
    countOnly: true,
  });

  // ---- publications (from articles.json) ----
  const articleList = articles?.articles ?? [];
  const dbPubs = await select<{ url: string }>(creds, "publications", "?kind=eq.journalism&select=url");
  {
    const { missing, extra } = diffKeys(new Set(articleList.map((a) => a.url)), new Set(dbPubs.map((p) => p.url)));
    reports.push({ table: "publications (kind=journalism, from articles.json)", jsonExpected: articleList.length, dbActual: dbPubs.length, missingFromDb: missing, extraInDb: extra, fieldMismatches: [] });
  }

  // ---- justice_stats ----
  if (justicesData) {
    const dbJusticeStats = await select<{ person_id: string; questions: number; total_words: number; cases_participated: number; majority_opinions: number; concurrences: number; dissents: number }>(
      creds, "justice_stats", `?term=eq.${justicesData.term}&select=person_id,questions,total_words,cases_participated,majority_opinions,concurrences,dissents`
    );
    const people = await select<{ id: string; slug: string }>(creds, "people", "?select=id,slug");
    const slugByPersonId = new Map(people.map((p) => [p.id, p.slug]));
    const dbByKey = new Map<string, typeof dbJusticeStats[number]>();
    for (const row of dbJusticeStats) {
      const slug = slugByPersonId.get(row.person_id);
      const key = Object.entries(JUSTICE_KEY_TO_SLUG).find(([, s]) => s === slug)?.[0];
      if (key) dbByKey.set(key, row);
    }
    const fieldMismatches: string[] = [];
    for (const j of justicesData.justices) {
      const db = dbByKey.get(j.key);
      if (!db) continue; // caught by missing-key diff below
      if (db.questions !== j.questions) fieldMismatches.push(`${j.key}: questions json=${j.questions} db=${db.questions}`);
      if (db.total_words !== j.totalWords) fieldMismatches.push(`${j.key}: total_words json=${j.totalWords} db=${db.total_words}`);
      if (db.cases_participated !== j.casesParticipated) fieldMismatches.push(`${j.key}: cases_participated json=${j.casesParticipated} db=${db.cases_participated}`);
    }
    const { missing, extra } = diffKeys(new Set(justicesData.justices.map((j) => j.key)), new Set(dbByKey.keys()));
    reports.push({ table: "justice_stats", jsonExpected: justicesData.justices.length, dbActual: dbJusticeStats.length, missingFromDb: missing, extraInDb: extra, fieldMismatches });
  }

  // ---- lawyer_stats ----
  if (lawyersData) {
    const dbLawyerStats = await select<{ label: string; total_words: number; cases_argued: number; wins: number; losses: number }>(
      creds, "lawyer_stats", `?term=eq.${lawyersData.term}&select=label,total_words,cases_argued,wins,losses`
    );
    const dbByLabel = new Map(dbLawyerStats.map((r) => [r.label, r]));
    const fieldMismatches: string[] = [];
    for (const l of lawyersData.lawyers) {
      const db = dbByLabel.get(l.label);
      if (!db) continue;
      if (db.total_words !== l.totalWords) fieldMismatches.push(`${l.label}: total_words json=${l.totalWords} db=${db.total_words}`);
      if (db.cases_argued !== l.casesArgued) fieldMismatches.push(`${l.label}: cases_argued json=${l.casesArgued} db=${db.cases_argued}`);
      if (db.wins !== l.wins) fieldMismatches.push(`${l.label}: wins json=${l.wins} db=${db.wins}`);
      if (db.losses !== l.losses) fieldMismatches.push(`${l.label}: losses json=${l.losses} db=${db.losses}`);
    }
    const { missing, extra } = diffKeys(new Set(lawyersData.lawyers.map((l) => l.label)), new Set(dbByLabel.keys()));
    reports.push({ table: "lawyer_stats", jsonExpected: lawyersData.lawyers.length, dbActual: dbLawyerStats.length, missingFromDb: missing, extraInDb: extra, fieldMismatches });
  }

  // ---- dependent tables: count-only comparison (no natural key) ----
  // Expected counts derived the same way write.ts computes them, so this
  // check is consistent with what dual-write actually produces. opinions
  // gets contributions from BOTH data/cases (majority/concurrence/dissent
  // authorship) AND enriched data/precedents (majorityAuthor +
  // dissentingOpinions) — backfill-db.ts writes both; missing the
  // precedents side here would make every run look like a mismatch.
  let expectedOpinions = 0, expectedKeyExchanges = 0, expectedCitations = 0, expectedCaseTerms = 0;
  for (const c of cases) {
    if (c.majorityAuthor) expectedOpinions++;
    expectedOpinions += (c.concurringSummaries?.length ?? 0) + (c.concurrenceAuthors?.filter((k) => !c.concurringSummaries?.some((s) => s.author === k)).length ?? 0);
    expectedOpinions += (c.dissentSummaries?.length ?? 0) + (c.dissentAuthors?.filter((k) => !c.dissentSummaries?.some((s) => s.author === k)).length ?? 0);
    for (const p of c.parties) expectedKeyExchanges += p.keyExchanges?.length ?? 0;
    expectedCitations += c.citedPrecedents.length;
    expectedCaseTerms += c.legalTermsUsed?.length ?? 0;
  }
  for (const p of precedents) {
    const enriched = "holding" in p && p.holding !== undefined;
    const isStatute = STATUTE_CITATION_RE.test(p.citation ?? "");
    if (isStatute || !enriched) continue; // statutes and stubs contribute no opinions
    if (p.majorityAuthor) expectedOpinions++;
    expectedOpinions += p.dissentingOpinions?.length ?? 0;
  }
  const [dbOpinionsCount, dbKeyExchangesCount, dbCitationsOnlyCount, dbStatuteCitationsCount, dbCaseTermsCount] = await Promise.all([
    select<{ id: string }>(creds, "opinions", "?select=id").then((r) => r.length),
    select<{ id: string }>(creds, "key_exchanges", "?select=id").then((r) => r.length),
    select<{ citing_case_id: string }>(creds, "citations", "?select=citing_case_id").then((r) => r.length),
    select<{ citing_case_id: string }>(creds, "statute_citations", "?select=citing_case_id").then((r) => r.length),
    select<{ case_id: string }>(creds, "case_terms", "?select=case_id").then((r) => r.length),
  ]);
  const dbCitationsCount = dbCitationsOnlyCount + dbStatuteCitationsCount;
  reports.push({ table: "opinions (count only, cases+precedents)", jsonExpected: expectedOpinions, dbActual: dbOpinionsCount, missingFromDb: [], extraInDb: [], fieldMismatches: [], countOnly: true });
  reports.push({ table: "key_exchanges (count only)", jsonExpected: expectedKeyExchanges, dbActual: dbKeyExchangesCount, missingFromDb: [], extraInDb: [], fieldMismatches: [], countOnly: true });
  reports.push({ table: "citations+statute_citations (count only)", jsonExpected: expectedCitations, dbActual: dbCitationsCount, missingFromDb: [], extraInDb: [], fieldMismatches: [], countOnly: true });
  reports.push({ table: "case_terms (count only)", jsonExpected: expectedCaseTerms, dbActual: dbCaseTermsCount, missingFromDb: [], extraInDb: [], fieldMismatches: [], countOnly: true });

  printReport(reports);
  writeGithubStepSummary(reports);

  const anyMismatch = reports.some((r) => !isOk(r));
  console.log(anyMismatch ? "Mismatches found — see above. Non-fatal; this is a report, not a gate." : "No mismatches found.");
}

/**
 * Appends a markdown version of the report to $GITHUB_STEP_SUMMARY when
 * running in GitHub Actions, so a mismatch shows up on the workflow run's
 * summary page without anyone having to open the step's raw logs. No-op
 * outside CI (the env var is unset locally).
 */
function writeGithubStepSummary(reports: TableReport[]): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const clean = reports.filter(isOk).length;
  const anyMismatch = clean < reports.length;

  const lines: string[] = [];
  lines.push(`## Parity check ${anyMismatch ? "⚠️ mismatches found" : "✅ clean"}`);
  lines.push("");
  lines.push(`${clean} / ${reports.length} tables match exactly. Non-fatal — this report never blocks the run.`);
  lines.push("");
  lines.push("| Table | Status | JSON | DB |");
  lines.push("|---|---|---|---|");
  for (const r of reports) {
    lines.push(`| ${r.table} | ${isOk(r) ? "✅" : "⚠️"} | ${r.jsonExpected} | ${r.dbActual} |`);
  }

  const mismatched = reports.filter((r) => !isOk(r));
  if (mismatched.length > 0) {
    lines.push("");
    lines.push("### Details");
    for (const r of mismatched) {
      lines.push("");
      lines.push(`**${r.table}**`);
      if (r.missingFromDb.length > 0) lines.push(`- missing from DB (${r.missingFromDb.length}): ${r.missingFromDb.slice(0, 20).join(", ")}${r.missingFromDb.length > 20 ? ", ..." : ""}`);
      if (r.extraInDb.length > 0) lines.push(`- extra in DB (${r.extraInDb.length}): ${r.extraInDb.slice(0, 20).join(", ")}${r.extraInDb.length > 20 ? ", ..." : ""}`);
      if (r.fieldMismatches.length > 0) {
        lines.push(`- field mismatches (${r.fieldMismatches.length}):`);
        r.fieldMismatches.slice(0, 20).forEach((m) => lines.push(`  - ${m}`));
      }
    }
  }

  fs.appendFileSync(summaryPath, lines.join("\n") + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
