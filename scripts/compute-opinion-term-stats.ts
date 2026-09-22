/**
 * compute-opinion-term-stats.ts
 *
 * Materializes the Opinions Data panel's 8 term-stat reads (opinion
 * length, justice agreement grid, joiner highlights, concurrence/dissent
 * join matrices, total words by justice, majority/minority rate,
 * justice_stats) into public.term_opinion_stats -- one row per (term,
 * metric_type), JSONB payload -- so the dashboard can eventually read
 * pre-computed rows instead of calling src/lib/db/term-stats.ts /
 * justice-stats.ts live on every render. Schema option A1 from the
 * "materializing Opinions Data term stats" investigation (2026-09-22) --
 * see 20260922000000_term_opinion_stats.sql. The live dashboard's read
 * path is NOT changed by this script -- it still calls those 8 functions
 * itself; this table has no reader yet.
 *
 * Calls those 8 functions completely UNCHANGED (no signature or logic
 * edits made to term-stats.ts/justice-stats.ts for this). Importing a
 * live value (not just a type) from src/lib/ is a deliberate one-off
 * exception to this codebase's otherwise-strict scripts/-vs-src/
 * separation (see src/lib/db/constants.ts's header) -- made because the
 * whole point is reusing that exact logic, not a second implementation of
 * it that could drift.
 *
 * Backfill and nightly population are the same script (like
 * compute-justice-stats.ts's optional `[term]` CLI arg): a backfill is
 * just this script's normal logic run once, before the table has ever
 * been populated, for a term already scoped down with --term.
 *
 * Run:
 *   npx tsx scripts/compute-opinion-term-stats.ts
 *     -- all TRACKED_TERMS, writes (the nightly pipeline step)
 *   npx tsx scripts/compute-opinion-term-stats.ts --term 2025
 *     -- one term only (e.g. the one-time OT2025 backfill), writes
 *   npx tsx scripts/compute-opinion-term-stats.ts --term 2025 --dry-run
 *     -- prints what would be written; writes nothing
 */

import { getCredentials } from "./lib/supabase-sync/env.js";
import { upsert } from "./lib/supabase-sync/client.js";
import type { SupabaseCredentials } from "./lib/supabase-sync/env.js";

// Same two tracked terms as scotusdashboard2-data.ts's TRACKED_TERMS --
// kept as its own copy per this codebase's scripts/-vs-src/ convention
// (constants.ts's header), not a cross-import. Bump by hand each October,
// same as that copy.
const TRACKED_TERMS = ["2025", "2026"];

const METRIC_TYPES = [
  "opinion_length",
  "agreement_grid",
  "joiner_highlights",
  "concurrence_join_matrix",
  "dissent_join_matrix",
  "total_words_by_justice",
  "majority_minority_rate",
  "justice_stats",
] as const;
type MetricType = (typeof METRIC_TYPES)[number];

function parseArgs(argv: string[]): { terms: string[]; dryRun: boolean } {
  const termIdx = argv.indexOf("--term");
  const terms = termIdx !== -1 && argv[termIdx + 1] ? [argv[termIdx + 1]] : TRACKED_TERMS;
  const dryRun = argv.includes("--dry-run");
  return { terms, dryRun };
}

/**
 * The 8 functions read via src/lib/db/client.ts's `db` -- a Supabase
 * client built from SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY (the anon key
 * the live site uses). GitHub Secrets only provisions
 * SUPABASE_SERVICE_ROLE_KEY for this workflow (no separate anon key), and
 * there's no reason to request a second secret just to read rows RLS's
 * "public read access" policies already expose to anon: the service-role
 * key is a strict superset of anon-key read access, and this usage stays
 * entirely inside scripts/, exactly where client.ts's own header comment
 * says the service-role key belongs. Locally, .env.local's real
 * SUPABASE_PUBLISHABLE_KEY (if present) is preferred untouched; the `??=`
 * fallback below only fires when that var isn't already set (CI).
 *
 * Dynamic import, not a top-level one: ES module imports are evaluated
 * before any of this file's own top-level statements run, so a top-level
 * `import` of term-stats.ts would read process.env before this function
 * has had a chance to set it.
 */
async function loadStatFunctions(creds: SupabaseCredentials) {
  process.env.SUPABASE_URL ??= creds.url;
  process.env.SUPABASE_PUBLISHABLE_KEY ??= creds.serviceRoleKey;

  const termStats = await import("../src/lib/db/term-stats.js");
  const justiceStats = await import("../src/lib/db/justice-stats.js");
  return { termStats, justiceStats };
}

type StatFunctions = Awaited<ReturnType<typeof loadStatFunctions>>;

// Deliberately Promise.all'd (not sequential) -- that's this script's own
// orchestration choice, not a change to the functions themselves. The
// redundant cases/opinions re-fetch inside getOpinionJoinerHighlights /
// getConcurrenceJoinMatrix / getDissentJoinMatrix (flagged in the
// investigation as a separate, minor inefficiency) is left exactly as-is
// -- out of scope here.
async function computeAllMetrics(term: string, fns: StatFunctions): Promise<Record<MetricType, unknown>> {
  const { termStats, justiceStats } = fns;
  const [
    opinionLength,
    agreementGrid,
    joinerHighlights,
    concurrenceJoinMatrix,
    dissentJoinMatrix,
    totalWordsByJustice,
    majorityMinorityRate,
    justiceStatsRows,
  ] = await Promise.all([
    termStats.getOpinionLengthStats(term),
    termStats.getJusticeAgreementGrid(term),
    termStats.getOpinionJoinerHighlights(term),
    termStats.getConcurrenceJoinMatrix(term),
    termStats.getDissentJoinMatrix(term),
    termStats.getTotalWordsByJustice(term),
    termStats.getMajorityMinorityRateByJustice(term),
    justiceStats.getJusticeStatsFromDb(term),
  ]);

  return {
    opinion_length: opinionLength,
    agreement_grid: agreementGrid,
    joiner_highlights: joinerHighlights,
    concurrence_join_matrix: concurrenceJoinMatrix,
    dissent_join_matrix: dissentJoinMatrix,
    total_words_by_justice: totalWordsByJustice,
    majority_minority_rate: majorityMinorityRate,
    justice_stats: justiceStatsRows,
  };
}

function summarize(payload: unknown): string {
  if (Array.isArray(payload)) return `${payload.length} row(s)`;
  if (payload && typeof payload === "object") return `${Object.keys(payload).length} key(s)`;
  return String(payload);
}

async function main() {
  const { terms, dryRun } = parseArgs(process.argv.slice(2));
  const creds = getCredentials();
  if (!creds) {
    console.log("[opinion-term-stats] skipped (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    return;
  }

  let fns: StatFunctions;
  try {
    fns = await loadStatFunctions(creds);
  } catch (err) {
    console.warn(
      `[opinion-term-stats] non-fatal: failed to load term-stats.ts/justice-stats.ts: ${err instanceof Error ? err.message : err}`,
    );
    return;
  }

  for (const term of terms) {
    console.log(`\n[opinion-term-stats] computing term ${term}${dryRun ? " (dry run)" : ""}...`);

    let metrics: Record<MetricType, unknown>;
    try {
      metrics = await computeAllMetrics(term, fns);
    } catch (err) {
      console.warn(`[opinion-term-stats] non-fatal: term ${term} failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const computedAt = new Date().toISOString();
    const rows = METRIC_TYPES.map((metricType) => ({
      term,
      metric_type: metricType,
      payload: metrics[metricType],
      computed_at: computedAt, // explicit, not left to the column default --
      // merge-duplicates upsert only touches columns present in the
      // payload, so omitting this would leave computed_at stuck at
      // whatever it was on first insert instead of refreshing each run.
    }));

    for (const row of rows) {
      console.log(`  ${dryRun ? "would write" : "writing"} ${row.metric_type}: ${summarize(row.payload)}`);
    }

    if (dryRun) continue;

    try {
      await upsert(creds, "term_opinion_stats", rows, "term,metric_type");
      console.log(`[opinion-term-stats] term ${term}: wrote ${rows.length} row(s).`);
    } catch (err) {
      console.warn(`[opinion-term-stats] non-fatal: term ${term} write failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  // Non-fatal at the top level too -- this script's whole job is an
  // additive cache population; a bug here must never fail the daily
  // pipeline run (see daily-update.yml's placement of this step and the
  // parity-check/sync-to-supabase steps' identical non-fatal precedent).
  console.warn(`[opinion-term-stats] non-fatal: ${err instanceof Error ? err.message : err}`);
});
