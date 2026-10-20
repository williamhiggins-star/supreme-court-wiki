import type { SupabaseCredentials } from "../sd-db/env.js";
import { insert, remove, select, upsert } from "../sd-db/client.js";
import { RULE_VERSION, buildEmergencyShadowDocket, type ApplicationRecord } from "./membership.js";

const COLUMNS =
  "docket_number,term,title,application_type,application_text,directed_to,filed_date,outcome,outcome_date,outcome_text,pending,docket_url";

/** Rebuilds emergency_shadow_docket from application_details under the
 *  current rule, and logs the run (with the unclassified list) in
 *  ingest_runs as stats.job = "emergency_shadow_docket". */
export async function rebuildEmergencyShadowDocket(creds: SupabaseCredentials) {
  const records = await select<ApplicationRecord>(creds, "application_details", `?select=${COLUMNS}`);
  const built = buildEmergencyShadowDocket(records);
  const builtAt = new Date().toISOString();

  await upsert(creds, "emergency_shadow_docket", built.rows.map((r) => ({ ...r, built_at: builtAt })), "docket_number");
  // Rows no longer in the grouping.
  await remove(creds, "emergency_shadow_docket", `built_at=lt.${builtAt}`);

  const stats = {
    job: "emergency_shadow_docket",
    rule_version: RULE_VERSION,
    applications: records.length,
    members: built.rows.length,
    excluded: built.excluded,
    unclassified: built.unclassified,
  };
  await insert(creds, "ingest_runs", [{ status: "succeeded", stats, finished_at: new Date().toISOString() }]);

  console.log(
    `[emergency/shadow docket] ${RULE_VERSION}: ${records.length} application(s): ${built.rows.length} in, ` +
      `${built.excluded} out (extensions), ${built.unclassified.length} unclassified.`,
  );
  for (const u of built.unclassified) console.log(`  unclassified ${u.docket_number} (${u.reason}): ${u.application_text}`);
  return stats;
}
