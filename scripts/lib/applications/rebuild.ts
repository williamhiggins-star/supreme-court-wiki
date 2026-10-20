/**
 * Writing emergency_shadow_docket from application_details. Two ways:
 *
 *   updateEmergencyShadowDocket  nightly, incremental: adds rows for new
 *     qualifying applications (public_view from the rule), updates the
 *     facts of rows whose application changed, removes rows that no longer
 *     qualify. Never writes public_view on an existing row. A day with no
 *     new or changed applications writes nothing.
 *
 *   rebuildEmergencyShadowDocket  manual, on purpose (e.g. a new rule
 *     version): regenerates every row from the base records, public_view
 *     from the rule, except rows a person has set by hand, which keep their
 *     public_view and only get their facts refreshed.
 *
 * public_view_set_by_hand is set by a database trigger whenever public_view
 * changes on an existing row; since this code never does that, any such
 * change is a person's.
 */

import type { SupabaseCredentials } from "../sd-db/env.js";
import { insert, remove, select, update } from "../sd-db/client.js";
import { RULE_VERSION, buildEmergencyShadowDocket, type ApplicationRecord, type EmergencyShadowDocketRow } from "./membership.js";

const FACTS = [
  "docket_number",
  "term",
  "title",
  "application_type",
  "application_text",
  "directed_to",
  "filed_date",
  "outcome",
  "outcome_date",
  "outcome_text",
  "pending",
  "docket_url",
] as const;

type StoredRow = EmergencyShadowDocketRow & { public_view: boolean; public_view_set_by_hand: boolean };

export interface EsdResult {
  job: "emergency_shadow_docket";
  mode: "nightly" | "full_rebuild";
  rule_version: string;
  applications: number;
  rows: number;
  inserted: string[];
  updated: string[];
  removed: string[];
  /** Applications the rule can't place: kept out of the table. */
  review: { docket_number: string; application_type: string | null; application_text: string; reason: string }[];
}

const factsOf = (r: EmergencyShadowDocketRow) => Object.fromEntries(FACTS.map((k) => [k, r[k]]));
const sameFacts = (a: EmergencyShadowDocketRow, b: EmergencyShadowDocketRow) => FACTS.every((k) => a[k] === b[k]);
const quoteList = (ids: string[]) => ids.map((id) => `"${id}"`).join(",");

async function load(creds: SupabaseCredentials) {
  const records = await select<ApplicationRecord>(creds, "application_details", `?select=${FACTS.join(",")}`);
  const stored = await select<StoredRow>(
    creds,
    "emergency_shadow_docket",
    `?select=${FACTS.join(",")},rule_version,public_view,public_view_set_by_hand`,
  );
  return { records, built: buildEmergencyShadowDocket(records), stored: new Map(stored.map((r) => [r.docket_number, r])) };
}

async function finish(creds: SupabaseCredentials, result: EsdResult): Promise<EsdResult> {
  await insert(creds, "ingest_runs", [{ status: "succeeded", stats: result, finished_at: new Date().toISOString() }]);
  console.log(
    `[emergency/shadow docket] ${result.mode} (${RULE_VERSION}): ${result.rows} row(s); ` +
      `${result.inserted.length} added, ${result.updated.length} updated, ${result.removed.length} removed; ` +
      `${result.review.length} for review.`,
  );
  return result;
}

/** Nightly: write only what changed. */
export async function updateEmergencyShadowDocket(creds: SupabaseCredentials): Promise<EsdResult> {
  const { records, built, stored } = await load(creds);
  const now = new Date().toISOString();
  const result: EsdResult = {
    job: "emergency_shadow_docket",
    mode: "nightly",
    rule_version: RULE_VERSION,
    applications: records.length,
    rows: built.rows.length,
    inserted: [],
    updated: [],
    removed: [],
    review: built.review,
  };

  const toInsert = [];
  for (const { defaultPublicView, ...row } of built.rows) {
    const existing = stored.get(row.docket_number);
    if (!existing) {
      toInsert.push({ ...row, public_view: defaultPublicView, built_at: now });
      result.inserted.push(row.docket_number);
    } else if (!sameFacts(existing, row)) {
      // Facts only: public_view is never part of a nightly write.
      await update(creds, "emergency_shadow_docket", `docket_number=eq.${row.docket_number}`, {
        ...factsOf(row),
        rule_version: RULE_VERSION,
        built_at: now,
      });
      result.updated.push(row.docket_number);
    }
  }
  if (toInsert.length) await insert(creds, "emergency_shadow_docket", toInsert);

  const qualifying = new Set(built.rows.map((r) => r.docket_number));
  result.removed = [...stored.values()]
    .filter((r) => !qualifying.has(r.docket_number) && !r.public_view_set_by_hand)
    .map((r) => r.docket_number);
  if (result.removed.length) await remove(creds, "emergency_shadow_docket", `docket_number=in.(${quoteList(result.removed)})`);
  result.rows = built.rows.length + [...stored.values()].filter((r) => !qualifying.has(r.docket_number) && r.public_view_set_by_hand).length;
  return finish(creds, result);
}

/** Manual: regenerate every row a person hasn't set by hand. */
export async function rebuildEmergencyShadowDocket(creds: SupabaseCredentials): Promise<EsdResult> {
  const { records, built, stored } = await load(creds);
  const now = new Date().toISOString();
  const byHand = new Map([...stored.values()].filter((r) => r.public_view_set_by_hand).map((r) => [r.docket_number, r]));
  const result: EsdResult = {
    job: "emergency_shadow_docket",
    mode: "full_rebuild",
    rule_version: RULE_VERSION,
    applications: records.length,
    rows: built.rows.length,
    inserted: [],
    updated: [],
    removed: [],
    review: built.review,
  };

  // Every row not set by hand is regenerated: removed, then inserted fresh.
  result.removed = [...stored.keys()].filter((no) => !byHand.has(no));
  await remove(creds, "emergency_shadow_docket", "public_view_set_by_hand=is.false");
  const fresh = built.rows
    .filter((r) => !byHand.has(r.docket_number))
    .map(({ defaultPublicView, ...row }) => ({ ...row, public_view: defaultPublicView, built_at: now }));
  if (fresh.length) await insert(creds, "emergency_shadow_docket", fresh);
  result.inserted = fresh.map((r) => r.docket_number);

  // Rows set by hand keep their public_view; their facts are refreshed.
  for (const row of built.rows) {
    if (!byHand.has(row.docket_number)) continue;
    await update(creds, "emergency_shadow_docket", `docket_number=eq.${row.docket_number}`, {
      ...factsOf(row),
      rule_version: RULE_VERSION,
      built_at: now,
    });
    result.updated.push(row.docket_number);
  }
  const qualifying = new Set(built.rows.map((r) => r.docket_number));
  result.rows = built.rows.length + [...byHand.keys()].filter((no) => !qualifying.has(no)).length;
  return finish(creds, result);
}
