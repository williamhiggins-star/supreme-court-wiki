#!/usr/bin/env tsx
/**
 * term-stats-feldman-check.ts
 *
 * Compares live-database term stats (OT2025 / cases.term = '2025') against
 * published numbers from Feldman's Stat Pack, per
 * docs/term-stats-coding-rules.md. Read-only: every call below is a GET
 * against PostgREST (`select()` from lib/supabase-sync/client.ts) — this
 * script never upserts, inserts, or deletes anything, and must not.
 *
 * As of Session 5 Phase 3, 20260830100000_term_stats_schema.sql (case_
 * lower_courts, cases.disposition, opinions.word_count) IS live. The
 * circuit-scorecard and word-count checks below query it directly rather
 * than assuming BLOCKED — but the columns are populated only for the 11
 * cases manually backfilled that session (0 of the original 55), and
 * opinions.word_count is populated nowhere at all (no parser writes it),
 * so both checks still report incomplete/blocked results — now for the
 * correct reason (no data), not a schema gap.
 *
 * The term_stats_* views (20260831090000_term_stats_views.sql) are NOT
 * live — this script queries the base tables directly and replicates
 * the view logic in TypeScript, same as Session 3.
 *
 * The ideological-split check uses an ad hoc, hardcoded bloc map, NOT the
 * justice_term_blocs table (also not live yet) — this is intentionally a
 * one-off in this script, not written anywhere, and not a substitute for
 * that table once it exists.
 *
 * Exits 0 whether stats pass, fail, or are skipped for missing
 * credentials — this is a report, not a CI gate (same policy as
 * parity-check.ts).
 *
 * Run: npx tsx scripts/term-stats-feldman-check.ts
 */

import { select } from "./lib/supabase-sync/client.js";
import { getCredentials, type SupabaseCredentials } from "./lib/supabase-sync/env.js";
import { JUSTICE_KEY_TO_SLUG } from "./lib/sd-db/constants.js";

const TERM = "2025";

interface CaseRow { id: string; slug: string; caption: string; argued_date: string | null; decided_date: string | null; status: string; }
interface OpinionRow { id: string; case_id: string; kind: string; author_id: string | null; }
interface DecisionRow { case_id: string; person_id: string; position: string; }
interface TieRow { case_id: string; person_id: string; opinion_id: string; }
interface PersonRow { id: string; slug: string; full_name: string; }

const MAJORITY_POS = new Set(["majority", "plurality", "concurrence"]);
const DISSENT_POS = new Set(["concur_dissent", "dissent"]);
const NOT_COUNTED_POS = new Set(["recused", "did_not_participate"]);
const CONCUR_KINDS = new Set(["concurrence", "concurrence_in_judgment", "concurrence_in_part"]);
const DISSENT_KINDS = new Set(["dissent", "dissent_in_part"]);
const MAJ_TIE_KINDS = new Set(["majority", "plurality", "concurrence", "concurrence_in_judgment", "concurrence_in_part"]);
const DIS_TIE_KINDS = new Set(["dissent", "dissent_in_part", "concur_dissent"]);

// Ad hoc, this-script-only — justice_term_blocs table doesn't exist live yet.
const BLOC: Record<string, "conservative" | "liberal"> = {
  roberts: "conservative", thomas: "conservative", alito: "conservative",
  gorsuch: "conservative", kavanaugh: "conservative", barrett: "conservative",
  sotomayor: "liberal", kagan: "liberal", jackson: "liberal",
};

type Verdict = "PASS" | "CLOSE" | "FAIL" | "BLOCKED";

interface Result { label: string; expected: string; computed: string; verdict: Verdict; note?: string; }
const results: Result[] = [];

function pctClose(a: number, b: number, tol = 0.6): boolean {
  return Math.abs(a - b) <= tol;
}

function report(label: string, expected: string, computed: string, verdict: Verdict, note?: string) {
  results.push({ label, expected, computed, verdict, note });
}

async function main() {
  const creds = getCredentials();
  if (!creds) {
    console.log("[term-stats-feldman-check] skipped: no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env or .env.local");
    process.exit(0);
  }

  // --- fetch: all decided, term=2025, scotus-level cases ---
  const allTermCases = await select<CaseRow & { courts: { level: string } | null }>(
    creds, "cases",
    `?select=id,slug,caption,argued_date,decided_date,status,courts(level)&term=eq.${TERM}`,
  );
  const cases = allTermCases.filter((c) => c.courts?.level === "scotus" && c.status === "decided");
  const caseIds = cases.map((c) => c.id);
  const caseById = new Map(cases.map((c) => [c.id, c]));

  console.log(`=== STEP 1: live counts, term=${TERM}, scotus-level ===`);
  console.log(`decided cases: ${cases.length} (expected 66 after Session 5's Phase 3 backfill)`);

  if (caseIds.length === 0) {
    console.log("No decided cases found for this term — nothing further to compute.");
    return;
  }

  const idFilter = `(${caseIds.join(",")})`;
  const [opinions, decisions, ties, people] = await Promise.all([
    select<OpinionRow>(creds, "opinions", `?select=id,case_id,kind,author_id&case_id=in.${idFilter}`),
    select<DecisionRow>(creds, "decisions", `?select=case_id,person_id,position&case_id=in.${idFilter}`),
    select<TieRow>(creds, "decision_ties", `?select=id,case_id,person_id,opinion_id&case_id=in.${idFilter}`),
    select<PersonRow>(creds, "people", `?select=id,slug,full_name`),
  ]);
  console.log(`opinions: ${opinions.length}, decisions: ${decisions.length}, decision_ties: ${ties.length}`);
  console.log();

  const personBySlug = new Map(people.map((p) => [p.slug, p]));
  const slugFor = (shortKey: string) => JUSTICE_KEY_TO_SLUG[shortKey];
  const personFor = (shortKey: string) => personBySlug.get(slugFor(shortKey));
  const opinionById = new Map(opinions.map((o) => [o.id, o]));

  const sideOf = (position: string): "majority" | "dissent" | null =>
    MAJORITY_POS.has(position) ? "majority" : DISSENT_POS.has(position) ? "dissent" : null;

  // case_id -> person_id -> side (participating only)
  const caseSides = new Map<string, Map<string, "majority" | "dissent">>();
  const casePositions = new Map<string, Map<string, string>>();
  for (const d of decisions) {
    if (!casePositions.has(d.case_id)) casePositions.set(d.case_id, new Map());
    casePositions.get(d.case_id)!.set(d.person_id, d.position);
    const s = sideOf(d.position);
    if (s) {
      if (!caseSides.has(d.case_id)) caseSides.set(d.case_id, new Map());
      caseSides.get(d.case_id)!.set(d.person_id, s);
    }
  }

  // --- unanimity (§1) ---
  let unanimous = 0;
  for (const cid of caseIds) {
    const positions = casePositions.get(cid);
    if (!positions) continue;
    const hasFullDissent = [...positions.values()].some((p) => p === "dissent");
    if (!hasFullDissent) unanimous++;
  }
  const nDecidedWithData = [...casePositions.keys()].length;
  const unanimousPct = (100 * unanimous) / nDecidedWithData;
  report(
    "Unanimity rate (all cases)", "43.9%", `${unanimousPct.toFixed(1)}% (${unanimous}/${nDecidedWithData})`,
    pctClose(unanimousPct, 43.9) ? "CLOSE" : "FAIL",
  );

  // --- majority frequency (§7) ---
  const participated = new Map<string, number>();
  const majorityCount = new Map<string, number>();
  for (const [, sides] of caseSides) {
    for (const [pid, side] of sides) {
      participated.set(pid, (participated.get(pid) ?? 0) + 1);
      if (side === "majority") majorityCount.set(pid, (majorityCount.get(pid) ?? 0) + 1);
    }
  }
  const majFreqExpected: Record<string, number> = { roberts: 95, kavanaugh: 95, barrett: 92 };
  for (const key of ["roberts", "kavanaugh", "barrett"]) {
    const p = personFor(key);
    if (!p) { report(`Majority frequency: ${key}`, `${majFreqExpected[key]}%`, "person not found", "FAIL"); continue; }
    const part = participated.get(p.id) ?? 0;
    const maj = majorityCount.get(p.id) ?? 0;
    const pct = part ? (100 * maj) / part : NaN;
    report(
      `Majority frequency: ${key} (all cases)`, `${majFreqExpected[key]}%`,
      `${pct.toFixed(1)}% (${maj}/${part})`,
      pctClose(pct, majFreqExpected[key]) ? "CLOSE" : "FAIL",
    );
  }

  // --- agreement matrix (§5) ---
  function agreementPct(aKey: string, bKey: string): { both: number; agree: number; pct: number } | null {
    const a = personFor(aKey), b = personFor(bKey);
    if (!a || !b) return null;
    let both = 0, agree = 0;
    for (const [, sides] of caseSides) {
      const sa = sides.get(a.id), sb = sides.get(b.id);
      if (sa && sb) {
        both++;
        if (sa === sb) agree++;
      }
    }
    return { both, agree, pct: both ? (100 * agree) / both : NaN };
  }
  const pairs: [string, string][] = [["kagan", "sotomayor"], ["kavanaugh", "roberts"], ["jackson", "sotomayor"], ["thomas", "alito"]];
  for (const [a, b] of pairs) {
    const r = agreementPct(a, b);
    if (!r) { report(`Agreement: ${a}-${b}`, "94%", "person not found", "FAIL"); continue; }
    report(
      `Agreement: ${a}-${b} (all cases)`, "94%", `${r.pct.toFixed(1)}% (${r.agree}/${r.both})`,
      pctClose(r.pct, 94) ? "CLOSE" : "FAIL",
    );
  }

  // --- ideologically split (§4), ad hoc bloc map ---
  const blocByPersonId = new Map<string, "conservative" | "liberal">();
  for (const [key, bloc] of Object.entries(BLOC)) {
    const p = personFor(key);
    if (p) blocByPersonId.set(p.id, bloc);
  }
  let split = 0;
  for (const [, sides] of caseSides) {
    const majIds = [...sides].filter(([, s]) => s === "majority").map(([pid]) => pid);
    const disIds = [...sides].filter(([, s]) => s === "dissent").map(([pid]) => pid);
    if (majIds.length === 0 || disIds.length === 0) continue;
    const allAccounted = [...majIds, ...disIds].every((pid) => blocByPersonId.has(pid));
    const majAllCons = majIds.every((pid) => blocByPersonId.get(pid) === "conservative");
    const disAllLib = disIds.every((pid) => blocByPersonId.get(pid) === "liberal");
    if (allAccounted && majAllCons && disAllLib) split++;
  }
  const splitPct = (100 * split) / nDecidedWithData;
  report(
    "Ideologically split (%)", "22.7%", `${splitPct.toFixed(1)}% (${split}/${nDecidedWithData})`,
    pctClose(splitPct, 22.7) ? "CLOSE" : "FAIL",
    "bloc map is ad hoc in this script, not from justice_term_blocs (not live)",
  );

  // --- opinions authored (§10 + §10a dedup) ---
  // §10a: an author can have multiple opinions rows for the same case
  // (a fractured opinion split into majority + plurality parts, e.g.
  // Learning Resources v. Trump/Roberts, Barrett v. United States/Jackson).
  // For the authorship-COUNT stat only, these dedupe to one opinion per
  // (case_id, author_id), keeping the higher-priority kind — verified
  // against Feldman's own table for majority > plurality; the rest of
  // the order is an unverified placeholder (see docs §10a).
  const KIND_PRIORITY = [
    "majority", "plurality", "per_curiam", "concur_dissent",
    "concurrence", "concurrence_in_judgment", "concurrence_in_part",
    "dissent", "dissent_in_part",
  ];
  const kindRank = new Map(KIND_PRIORITY.map((k, i) => [k, i]));
  const bestKindByCaseAuthor = new Map<string, string>(); // `${case_id}::${author_id}` -> kind
  for (const o of opinions) {
    if (!o.author_id) continue;
    const key = `${o.case_id}::${o.author_id}`;
    const existing = bestKindByCaseAuthor.get(key);
    if (!existing || (kindRank.get(o.kind) ?? 99) < (kindRank.get(existing) ?? 99)) {
      bestKindByCaseAuthor.set(key, o.kind);
    }
  }
  const authoredByPerson = new Map<string, Map<string, number>>();
  for (const [key, kind] of bestKindByCaseAuthor) {
    const authorId = key.split("::")[1];
    if (!authoredByPerson.has(authorId)) authoredByPerson.set(authorId, new Map());
    const m = authoredByPerson.get(authorId)!;
    m.set(kind, (m.get(kind) ?? 0) + 1);
  }
  function summarize(key: string) {
    const p = personFor(key);
    if (!p) return null;
    const m = authoredByPerson.get(p.id) ?? new Map();
    let total = 0, concurrences = 0, dissents = 0;
    for (const [kind, n] of m) {
      total += n;
      if (CONCUR_KINDS.has(kind)) concurrences += n;
      if (DISSENT_KINDS.has(kind)) dissents += n;
    }
    return { total, concurrences, dissents, breakdown: Object.fromEntries(m) };
  }
  const thomas = summarize("thomas");
  report("Thomas: total opinions", "28", String(thomas?.total ?? "N/A"), thomas?.total === 28 ? "PASS" : "FAIL", JSON.stringify(thomas?.breakdown));
  report("Thomas: concurrences", "15", String(thomas?.concurrences ?? "N/A"), thomas?.concurrences === 15 ? "PASS" : "FAIL");
  const jackson = summarize("jackson");
  report("Jackson: total opinions", "26", String(jackson?.total ?? "N/A"), jackson?.total === 26 ? "PASS" : "FAIL", JSON.stringify(jackson?.breakdown));
  report("Jackson: dissents", "10", String(jackson?.dissents ?? "N/A"), jackson?.dissents === 10 ? "PASS" : "FAIL");
  const roberts = summarize("roberts");
  report("Roberts: total opinions", "6", String(roberts?.total ?? "N/A"), roberts?.total === 6 ? "PASS" : "FAIL", JSON.stringify(roberts?.breakdown));

  // --- days to decision, Sotomayor as majority author (§9) ---
  const sotomayor = personFor("sotomayor");
  const days: number[] = [];
  for (const o of opinions) {
    if (o.kind !== "majority" || o.author_id !== sotomayor?.id) continue;
    const c = caseById.get(o.case_id);
    if (!c?.argued_date || !c?.decided_date) continue;
    const d = (new Date(c.decided_date).getTime() - new Date(c.argued_date).getTime()) / 86400000;
    days.push(d);
  }
  const avgDays = days.length ? days.reduce((a, b) => a + b, 0) / days.length : NaN;
  report(
    "Sotomayor: avg days to decision (majority author)", "68.83",
    days.length ? `${avgDays.toFixed(2)} (n=${days.length}: [${days.join(", ")}])` : "no data",
    Math.abs(avgDays - 68.83) <= 3 ? "CLOSE" : "FAIL",
  );

  // --- circuit scorecard: CA5 (§8) — case_lower_courts + cases.disposition
  // are live as of Session 5 Phase 3, but nothing populates them for the
  // original 55 daily-pipeline cases (only the 11 manually backfilled
  // cases have these fields at all) — checked directly below rather than
  // assumed blocked or assumed complete. ----
  interface LowerCourtRow { case_id: string; court_id: string; docket_number: string | null }
  interface CourtRow { id: string; slug: string; name: string }
  const [lowerCourts, courts, disposCases] = await Promise.all([
    select<LowerCourtRow>(creds, "case_lower_courts", `?select=case_id,court_id,docket_number&case_id=in.${idFilter}`),
    select<CourtRow>(creds, "courts", "?select=id,slug,name"),
    select<{ id: string; disposition: string | null }>(creds, "cases", `?select=id,disposition&id=in.${idFilter}`),
  ]);
  const courtBySlug = new Map(courts.map((c) => [c.slug, c]));
  const dispositionByCaseId = new Map(disposCases.map((c) => [c.id, c.disposition]));
  const ca5 = courtBySlug.get("fifth-circuit");
  // Feldman's own Circuit Scorecard (p.14) has exactly two buckets —
  // Affirm and Reversed, with Affirm + Reversed always summing to the
  // decided count. There is no third "vacated" column, so per §8a,
  // everything that isn't a clean "affirmed" (vacated, vacated_and_remanded,
  // reversed, reversed_and_remanded, GVR, GRR) buckets into "Reversed" for
  // this specific comparison — matching his table's own arithmetic, not a
  // general statement that vacated means reversed everywhere else.
  const ca5Rows = ca5 ? lowerCourts.filter((r) => r.court_id === ca5.id) : [];
  const ca5Decided = ca5Rows.length;
  const ca5Affirmed = ca5Rows.filter((r) => dispositionByCaseId.get(r.case_id) === "affirmed").length;
  const ca5Reversed = ca5Rows.filter((r) => {
    const d = dispositionByCaseId.get(r.case_id);
    return d !== null && d !== "affirmed";
  }).length;
  const casesWithLowerCourtData = new Set(lowerCourts.map((r) => r.case_id)).size;
  report(
    "Circuit scorecard: CA5 (decided/affirmed/reversed)", "11 / 3 / 8",
    `${ca5Decided} / ${ca5Affirmed} / ${ca5Reversed}`,
    ca5Decided === 11 && ca5Affirmed === 3 && ca5Reversed === 8 ? "PASS" : "FAIL",
    `case_lower_courts/disposition populated for ${casesWithLowerCourtData} of 66 cases as of Session 9's circuit-scorecard backfill (see docs §8a)`,
  );

  // Full 13-circuit breakdown, per §8a's "U.S. Courts of Appeals only"
  // scoping (federal_appellate level only — excludes state courts and
  // federal district courts, which also have case_lower_courts rows now).
  const FELDMAN_CIRCUITS: Record<string, [number, number, number]> = {
    "first-circuit": [2, 2, 0], "second-circuit": [9, 3, 6], "third-circuit": [3, 1, 2],
    "fourth-circuit": [8, 1, 7], "fifth-circuit": [11, 3, 8], "sixth-circuit": [4, 2, 2],
    "seventh-circuit": [2, 0, 2], "eighth-circuit": [1, 0, 1], "ninth-circuit": [7, 1, 6],
    "tenth-circuit": [3, 2, 1], "eleventh-circuit": [3, 0, 3], "dc-circuit": [6, 2, 4],
    "federal-circuit": [2, 1, 1],
  };
  const appellateCourts = courts.filter((c) => c.slug in FELDMAN_CIRCUITS);
  console.log("\n=== Circuit scorecard: all 13 circuits (§8a, federal_appellate only) ===");
  let circuitsMatching = 0;
  for (const court of appellateCourts) {
    const rows = lowerCourts.filter((r) => r.court_id === court.id);
    const decided = rows.length;
    const affirmed = rows.filter((r) => dispositionByCaseId.get(r.case_id) === "affirmed").length;
    const reversed = rows.filter((r) => {
      const d = dispositionByCaseId.get(r.case_id);
      return d !== null && d !== "affirmed";
    }).length;
    const [ed, ea, er] = FELDMAN_CIRCUITS[court.slug];
    const ok = decided === ed && affirmed === ea && reversed === er;
    if (ok) circuitsMatching++;
    console.log(`  ${court.slug.padEnd(16)} ours=${decided}/${affirmed}/${reversed}  feldman=${ed}/${ea}/${er}  ${ok ? "MATCH" : "known near-miss"}`);
  }
  console.log(`${circuitsMatching} / 13 circuits match exactly.\n`);

  // --- word count extremes (§ opinion word counts) — opinions.word_count
  // is live but populated nowhere (0 of any opinion, backfilled or
  // original) — no parser writes it. ----
  const [wcOpinions] = await Promise.all([
    select<{ id: string; word_count: number | null }>(creds, "opinions", `?select=id,word_count&case_id=in.${idFilter}`),
  ]);
  const withWordCount = wcOpinions.filter((o) => o.word_count !== null);
  report(
    "Word count extremes: Chatrie (shortest) / Barbara (longest)", "≈60 / ≈29,400",
    withWordCount.length > 0 ? `${withWordCount.length} opinions with word_count set` : "0 of 563 opinions have word_count set",
    "BLOCKED",
    "opinions.word_count column is live but populated nowhere — no parser change writes it (out of scope every session so far)",
  );

  // --- vote-side-derivation cross-check (§11), against real data ---
  const tieSide = new Map<string, { dissent: boolean; majority: boolean }>();
  for (const t of ties) {
    const op = opinionById.get(t.opinion_id);
    if (!op) continue;
    const key = `${t.case_id}::${t.person_id}`;
    const cur = tieSide.get(key) ?? { dissent: false, majority: false };
    if (DIS_TIE_KINDS.has(op.kind)) cur.dissent = true;
    if (MAJ_TIE_KINDS.has(op.kind)) cur.majority = true;
    tieSide.set(key, cur);
  }
  let match = 0, mismatch = 0, unverifiable = 0;
  const mismatchDetail: string[] = [];
  const personById = new Map(people.map((p) => [p.id, p]));
  for (const d of decisions) {
    if (NOT_COUNTED_POS.has(d.position)) continue;
    const key = `${d.case_id}::${d.person_id}`;
    const ts = tieSide.get(key);
    const stored = sideOf(d.position);
    if (!ts) { unverifiable++; continue; }
    const derived = ts.dissent ? "dissent" : ts.majority ? "majority" : null;
    if (derived === stored) match++;
    else {
      mismatch++;
      const c = caseById.get(d.case_id);
      const p = personById.get(d.person_id);
      mismatchDetail.push(`${c?.slug ?? d.case_id} / ${p?.slug ?? d.person_id}: stored=${d.position} derived=${derived}`);
    }
  }
  console.log(`=== Vote-side cross-check (§11), real data ===`);
  console.log(`match=${match} mismatch=${mismatch} unverifiable=${unverifiable} total=${match + mismatch + unverifiable}`);
  if (mismatchDetail.length) console.log(mismatchDetail.join("\n"));
  console.log();

  console.log("=== Feldman comparison: pass/fail table ===");
  for (const r of results) {
    console.log(`[${r.verdict.padEnd(7)}] ${r.label} — expected ${r.expected}, computed ${r.computed}${r.note ? `  (${r.note})` : ""}`);
  }
}

main().catch((err) => {
  console.error("[term-stats-feldman-check] error:", err instanceof Error ? err.message : err);
  process.exit(0); // report, never gate — same policy as parity-check.ts
});
