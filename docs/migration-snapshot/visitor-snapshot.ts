/**
 * visitor-snapshot.ts -- READ-ONLY snapshot of what the public site shows
 * and counts, for the migration safeguards in CLAUDE.md (before/after,
 * each taken twice). See docs/court-data-state.md.
 *
 * Reads with the publishable (anon) key, exactly like the live site, so
 * RLS applies. Writes <SNAPSHOT_DIR>/snapshots/<label>.json. Never prints
 * keys. Not part of the build or the daily run.
 *
 *   cd supreme-court-wiki-app
 *   SNAPSHOT_DIR=/some/scratch/dir FREEZE_TODAY=2026-10-20 \
 *     npx tsx docs/migration-snapshot/visitor-snapshot.ts before-1
 *
 * FREEZE_TODAY pins "today" so a pair of runs can't straddle midnight or
 * an argument date. Compare with `cmp` (bytes) and
 * docs/migration-snapshot/compare-unordered.js (ignores array order).
 */
import * as fs from "fs";
import * as path from "path";

const SCRATCH = process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), "..", "snapshot-scratch");
const label = process.argv[2] ?? "snapshot";

// --- env (same pattern as scripts/lib/sd-db/env.ts), no echo ---
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
if (!process.env.SUPABASE_URL?.includes("enwjtgjycthjypeqdgfo")) throw new Error("not the SD project");

// --- freeze the clock: getDocketStatus()/getCaseDocketStatus() and
// getScotusDashboard2Data()'s today/tomorrow all read `new Date()`. A
// before/after pair straddling midnight (or an argument date) would
// otherwise reclassify upcoming->argued on its own. ---
const FREEZE = process.env.FREEZE_TODAY; // YYYY-MM-DD
if (FREEZE) {
  const fixed = new Date(`${FREEZE}T12:00:00`).getTime();
  const RealDate = Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Date = class extends RealDate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      if (args.length === 0) super(fixed);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else super(...(args as [any]));
    }
    static now() { return fixed; }
  };
}

// --- canonical JSON: sorted object keys; arrays left in order EXCEPT the
// ones listed as set-like (PostgREST embed order is not guaranteed, and
// several CaseSummary arrays are built in embed order). ---
const SET_LIKE_KEYS = new Set([
  "concurrenceAuthors", "dissentAuthors", "concurDissentAuthors", "majoritySideJustices",
  "pluralityJoinedBy", "joinedBy", "concurringSummaries", "dissentSummaries", "concurDissentSummaries",
  "lowerCourts", "keyExchanges", "parties", "cases" /* calendar event case lists */,
]);
// Fields that legitimately change with no display impact, or are wall-clock.
const DROP_KEYS = new Set([
  "processedAt",   // = cases.updated_at; the rename UPDATE bumps it via cases_set_updated_at trigger
  "computed_at", "created_at", "updated_at",
  "today", "tomorrow", // also frozen above, dropped for safety
]);
function canon(v: unknown, key?: string): unknown {
  if (Array.isArray(v)) {
    const arr = v.map((x) => canon(x));
    return key && SET_LIKE_KEYS.has(key) ? arr.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : arr;
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (DROP_KEYS.has(k)) continue;
      out[k] = canon((v as Record<string, unknown>)[k], k);
    }
    return out;
  }
  return v;
}

// src/lib/articles.ts etc. `import "server-only"`, a Next build-time
// marker package that isn't installed in node_modules -- stub it out.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const STUB = path.join(SCRATCH, "tools", "server-only-stub.js");
fs.mkdirSync(path.dirname(STUB), { recursive: true });
fs.writeFileSync(STUB, "module.exports = {};\n");
const origResolve = Module._resolveFilename;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module._resolveFilename = function (request: string, ...rest: any[]) {
  if (request === "server-only") return STUB;
  return origResolve.call(this, request, ...rest);
};

async function main() {
  const { getScotusDashboard2Data } = await import(path.join(process.cwd(), "src/lib/scotusdashboard2-data.ts"));
  const { db } = await import(path.join(process.cwd(), "src/lib/db/client.ts"));
  const termStats = await import(path.join(process.cwd(), "src/lib/db/term-stats.ts"));
  const justiceStats = await import(path.join(process.cwd(), "src/lib/db/justice-stats.ts"));
  const casesLib = await import(path.join(process.cwd(), "src/lib/db/cases.ts"));
  const TERMS = ["2024", "2025", "2026"];

  const snap: Record<string, unknown> = {};

  // 1. The whole render payload of /dashboard and /welcome.
  const d = await getScotusDashboard2Data();
  // JSON-sourced, pipeline-committed, unrelated to the migration -- keep
  // only their sizes so a daily commit between runs doesn't drown the diff.
  const { scotusblogArticles, otherArticles, articlesByCaseSlug, circuitSplitsBySlug, ...rest } = d;
  snap.dashboard = {
    ...rest,
    cases: [...rest.cases].sort((a, b) => a.slug.localeCompare(b.slug)),
    // Docket columns (display order matters -- keep as built, but also a
    // slug list per column for a readable diff).
    docketColumns: {
      upcoming: rest.upcomingCases.map((c: { slug: string }) => c.slug),
      argued: rest.arguedCases.map((c: { slug: string }) => c.slug),
      decided: rest.decidedItems.map((c: { slug: string }) => c.slug),
      allCases: rest.allCasesItems.map((c: { slug: string; docketStatus: string }) => `${c.docketStatus}:${c.slug}`),
    },
    jsonSourcedSizes: {
      scotusblogArticles: scotusblogArticles.length,
      otherArticles: otherArticles.length,
      articlesByCaseSlug: Object.keys(articlesByCaseSlug).length,
      circuitSplitsBySlug: Object.keys(circuitSplitsBySlug).length,
    },
  };

  // 2. Live (non-materialized) recomputation of the 8 Opinions Data
  //    metrics -- term_opinion_stats only changes after the nightly job,
  //    so the stored payload alone can't show a migration's effect.
  snap.liveOpinionStats = {};
  for (const t of TERMS) {
    (snap.liveOpinionStats as Record<string, unknown>)[t] = {
      opinionLength: await termStats.getOpinionLengthStats(t),
      agreementGrid: await termStats.getJusticeAgreementGrid(t),
      joinerHighlights: await termStats.getOpinionJoinerHighlights(t),
      concurrenceJoinMatrix: await termStats.getConcurrenceJoinMatrix(t),
      dissentJoinMatrix: await termStats.getDissentJoinMatrix(t),
      totalWordsByJustice: await termStats.getTotalWordsByJustice(t),
      majorityMinorityRate: await termStats.getMajorityMinorityRateByJustice(t),
      justiceStats: await justiceStats.getJusticeStatsFromDb(t),
      decidedSlugs: await casesLib.getAllDecidedCaseSlugs(t),
    };
  }

  // 3. Stored/materialized tables (minus timestamps).
  const dump = async (rel: string, order: string[]) => {
    let q = db.from(rel).select("*");
    for (const o of order) q = q.order(o, { ascending: true, nullsFirst: true });
    const out: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await q.range(from, from + 999);
      if (error) throw new Error(`${rel}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    // stable regardless of ORDER BY ties
    return out.map((r) => canon(r)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  };
  snap.term_opinion_stats = await dump("term_opinion_stats", ["term", "metric_type"]);
  snap.justice_stats = await dump("justice_stats", ["term", "person_id"]);
  snap.lawyer_stats = await dump("lawyer_stats", ["term", "label"]);

  // 4. Every term_stats_* view, fully dumped and sorted.
  const VIEWS = [
    "term_stats_case_sides", "term_stats_case_splits", "term_stats_ideological_splits",
    "term_stats_opinions_by_type", "term_stats_unanimity_rate", "term_stats_majority_frequency",
    "term_stats_agreement", "term_stats_vote_split_distribution", "term_stats_ideological_split_rate",
    "term_stats_closely_divided_cases", "term_stats_circuit_scorecard_detail", "term_stats_circuit_scorecard",
    "term_stats_opinions_authored", "term_stats_opinions_authored_summary", "term_stats_days_to_decision",
    "term_stats_days_to_decision_by_author", "term_stats_word_counts_by_author",
    "term_stats_word_counts_by_type_over_time", "term_stats_opinion_word_count_extremes",
    "term_stats_case_combined_word_counts", "term_stats_voting_alignment_grid", "term_stats_sitting_index",
    "term_stats_vote_side_cross_check", "term_stats_companion_cases",
  ];
  snap.views = {};
  for (const v of VIEWS) (snap.views as Record<string, unknown>)[v] = await dump(v, []);

  // 5. Status census + docket_entries census (expected to change ONLY by
  //    the documented rename mapping; anything else is a regression).
  const cases = await dump("cases", []) as { id: string; term: string | null; status: string; argued_date: string | null }[];
  const census: Record<string, number> = {};
  for (const c of cases) census[`${c.term}|${c.status}`] = (census[`${c.term}|${c.status}`] ?? 0) + 1;
  snap.casesByTermStatus = census;
  const de = await dump("docket_entries", []) as { case_id: string | null }[];
  const deBy: Record<string, number> = {};
  for (const e of de) deBy[e.case_id ?? "NULL"] = (deBy[e.case_id ?? "NULL"] ?? 0) + 1;
  snap.docketEntriesByCaseId = Object.fromEntries(Object.entries(deBy).sort());
  snap.docketEntriesTotal = de.length;

  const out = path.join(SCRATCH, "snapshots", `${label}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(canon(snap), null, 1));
  console.log(`wrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

/*
 * DIFF RULES
 * - Expected-only changes after the status migration:
 *     casesByTermStatus: "2026|petition"->"2026|argued", "2026|upcoming"->"2026|set_for_argument"
 *     (+ any intentionally inserted "<term>|granted" rows).
 *     raw `cases`/view rows are NOT dumped wholesale for that reason; the
 *     dashboard payload carries the rendered result.
 * - Everything else under dashboard.*, liveOpinionStats.*, views.*,
 *   term_opinion_stats, justice_stats, lawyer_stats must be byte-identical.
 * - CaseSummary.docketStatus will legitimately change from "petition"/"upcoming"
 *   to undefined (or new literals) unless cases.ts's DOCKET_STATUS_BY_DB_STATUS
 *   is updated -- that field is NOT rendered directly (getDocketStatus only
 *   checks === "decided"), so either drop it from the diff or assert the
 *   DecidedItem.docketStatus (derived) is unchanged instead.
 * - docketEntriesByCaseId: identical; any "NULL" key after migration means a
 *   docket-only row was inserted (fine) -- assert the per-case_id counts for
 *   non-NULL keys are unchanged and that dashboard.cases[*].docketEntries is
 *   unchanged.
 */
