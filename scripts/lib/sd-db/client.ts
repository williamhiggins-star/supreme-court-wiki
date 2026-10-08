/**
 * client.ts — thin Supabase REST (PostgREST) client built on Node 20 native fetch.
 *
 * No new npm dependency: the Supabase JS SDK is not required for the small set
 * of upsert/select/insert calls this sync performs. All calls target
 * `{SUPABASE_URL}/rest/v1/<table>` with the service-role key in both the
 * `apikey` and `Authorization: Bearer` headers (RLS is bypassed by the
 * service role — the schema tables are service-role-only).
 *
 * Every function THROWS SupabaseSyncError on any non-2xx response or network
 * failure. The orchestrator (run.ts) is responsible for the non-fatal policy:
 * catch, log `[sync] non-fatal:`, and exit 0 so the daily workflow is never
 * broken by the outbound sync.
 */

import type { SupabaseCredentials } from "./env.js";

export class SupabaseSyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "SupabaseSyncError";
  }
}

function headers(creds: SupabaseCredentials, extra: Record<string, string> = {}) {
  return {
    apikey: creds.serviceRoleKey,
    Authorization: `Bearer ${creds.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(
  creds: SupabaseCredentials,
  method: string,
  pathAndQuery: string,
  opts: { body?: unknown; prefer?: string } = {},
): Promise<unknown> {
  const url = `${creds.url}/rest/v1/${pathAndQuery}`;
  const extra: Record<string, string> = {};
  if (opts.prefer) extra.Prefer = opts.prefer;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: headers(creds, extra),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (err) {
    throw new SupabaseSyncError(
      `network error ${method} ${pathAndQuery}: ${(err as Error).message}`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SupabaseSyncError(
      `${method} ${pathAndQuery} → ${res.status}`,
      res.status,
      body.slice(0, 500),
    );
  }

  const text = await res.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/** GET rows. `query` is the querystring after the table name, e.g. "?select=slug,raw". */
export async function select<T = Record<string, unknown>>(
  creds: SupabaseCredentials,
  table: string,
  query = "?select=*",
): Promise<T[]> {
  return (await request(creds, "GET", `${table}${query}`)) as T[];
}

/**
 * Upsert rows keyed on `onConflict`, returning the representation (so callers
 * can read back generated ids). Uses merge-duplicates resolution.
 */
export async function upsert<T = Record<string, unknown>>(
  creds: SupabaseCredentials,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<T[]> {
  if (rows.length === 0) return [];
  const query = `${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  return (await request(creds, "POST", query, {
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  })) as T[];
}

/** Plain insert (append-only tables: events). Returns the inserted representation. */
export async function insert<T = Record<string, unknown>>(
  creds: SupabaseCredentials,
  table: string,
  rows: Record<string, unknown>[],
): Promise<T[]> {
  if (rows.length === 0) return [];
  return (await request(creds, "POST", table, {
    body: rows,
    prefer: "return=representation",
  })) as T[];
}

/**
 * DELETE rows matching a PostgREST filter, e.g. `remove(creds, "opinions",
 * "case_id=eq.<uuid>")`. Used for the daily dual-write's idempotent
 * replace-on-rerun pattern (tables with no natural unique key — opinions,
 * key_exchanges, citations, case_terms, case_participations — get their
 * existing rows for a case deleted and reinserted rather than
 * accumulating duplicates across repeated runs).
 */
export async function remove(
  creds: SupabaseCredentials,
  table: string,
  filter: string,
): Promise<void> {
  await request(creds, "DELETE", `${table}?${filter}`, {});
}

/**
 * PATCH rows matching a PostgREST filter, e.g. `update(creds, "opinions",
 * "id=eq.<uuid>", { word_count: 42 })`. Returns the updated representation.
 */
export async function update<T = Record<string, unknown>>(
  creds: SupabaseCredentials,
  table: string,
  filter: string,
  patch: Record<string, unknown>,
): Promise<T[]> {
  return (await request(creds, "PATCH", `${table}?${filter}`, {
    body: patch,
    prefer: "return=representation",
  })) as T[];
}
