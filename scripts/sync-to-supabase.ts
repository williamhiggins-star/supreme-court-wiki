/**
 * sync-to-supabase.ts — outbound daily sync: dashboard → DYSTL Supabase mirror.
 *
 * Runs as the FINAL step of .github/workflows/daily-update.yml, AFTER the bot
 * commits the daily case JSON. Supabase therefore mirrors exactly what was
 * published.
 *
 * NON-FATAL BY CONSTRUCTION (master-plan Decision 3): every Supabase
 * interaction is wrapped. On ANY failure — missing env vars, network, 4xx/5xx —
 * this script logs a `[sync] non-fatal:` line and EXITS 0. Combined with the
 * workflow step's `continue-on-error: true` and its placement AFTER the commit
 * step, a sync failure can never affect the daily JSON fetch-and-commit path.
 *
 * Credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) come from GitHub Secrets
 * at runtime. When absent (e.g. local dev, or secrets not yet added) the sync
 * logs "sync skipped (no credentials)" and exits 0.
 *
 * Run: npx tsx scripts/sync-to-supabase.ts
 */

import { getCredentials } from "./lib/supabase-sync/env.js";
import { runSync } from "./lib/supabase-sync/run.js";

async function main(): Promise<void> {
  const creds = getCredentials();
  if (!creds) {
    console.log("[sync] sync skipped (no credentials)");
    return;
  }
  await runSync(creds, "sync");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[sync] non-fatal: ${msg}`);
    // Exit 0: the outbound sync must never break the daily workflow.
    process.exit(0);
  });
