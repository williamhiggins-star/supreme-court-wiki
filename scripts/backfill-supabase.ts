/**
 * backfill-supabase.ts — one-time backfill of the current corpus into the DYSTL
 * Supabase mirror (60 cases, 24 circuit splits, appellate impacts, articles).
 *
 * Shares the exact same mappers and event derivation as the daily
 * sync-to-supabase.ts (via scripts/lib/supabase-sync) — there is ONE mapping
 * implementation. In backfill mode every emitted lifecycle event is stamped
 * metadata.backfill=true, giving B1/B2 real baseline material.
 *
 * Idempotent: hash-checked upserts + event dedup mean re-running the backfill
 * upserts nothing and emits no new events.
 *
 * This is NOT part of the cron. It is run manually LATER, once Supabase
 * credentials are available. If credentials are missing it fails LOUDLY with an
 * actionable message and exits 1.
 *
 * Run: npx tsx scripts/backfill-supabase.ts
 */

import { getCredentials } from "./lib/supabase-sync/env.js";
import { runSync } from "./lib/supabase-sync/run.js";

async function main(): Promise<void> {
  const creds = getCredentials();
  if (!creds) {
    console.error(
      "[backfill] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set " +
        "(in .env.local or the environment) to run the one-time backfill. Aborting.",
    );
    process.exit(1);
  }

  console.log(
    "[backfill] starting one-time backfill (baseline events stamped metadata.backfill=true)…",
  );
  const summary = await runSync(creds, "backfill");
  console.log("[backfill] complete:", JSON.stringify(summary));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[backfill] failed: ${msg}`);
  process.exit(1);
});
