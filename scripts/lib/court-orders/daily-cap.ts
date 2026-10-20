import type { SupabaseCredentials } from "../sd-db/env.js";
import { select } from "../sd-db/client.js";

/** The approved ceiling on requests to supremecourt.gov per UTC day,
 *  across every job that logs `stats.requests` in ingest_runs. */
export const DAILY_CAP = 1500;
export const DAILY_CAP_BACKFILL = 2500;

/** Requests already made today (UTC) by any job logged in ingest_runs. */
export async function requestsToday(creds: SupabaseCredentials): Promise<number> {
  const since = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  const runs = await select<{ requests: number | string | null }>(
    creds,
    "ingest_runs",
    `?select=requests:stats->requests&started_at=gte.${since}`,
  );
  return runs.reduce((n, r) => n + (Number(r.requests) || 0), 0);
}
