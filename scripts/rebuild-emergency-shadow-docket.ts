/**
 * rebuild-emergency-shadow-docket.ts — the MANUAL full rebuild of
 * emergency_shadow_docket from application_details under the current rule
 * (scripts/lib/applications/membership.ts). Run it on purpose, e.g. after
 * the rule version changes; the nightly run only updates incrementally.
 * Rows whose public_view a person set by hand keep it. Prints the review
 * list. No requests to the Court.
 *
 * Run:  npx tsx scripts/rebuild-emergency-shadow-docket.ts
 */

import { getCredentials } from "./lib/sd-db/env.js";
import { reportSdWriteFailure } from "./lib/sd-db/failures.js";
import { rebuildEmergencyShadowDocket } from "./lib/applications/rebuild.js";

const creds = getCredentials();
if (!creds) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
rebuildEmergencyShadowDocket(creds)
  .then((r) => {
    for (const u of r.review) console.log(`  review ${u.docket_number} (${u.reason}): ${u.application_text}`);
  })
  .catch((err) => {
  reportSdWriteFailure("rebuild-emergency-shadow-docket", err);
  process.exitCode = 1;
});
