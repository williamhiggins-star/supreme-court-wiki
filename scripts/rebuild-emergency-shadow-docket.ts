/**
 * rebuild-emergency-shadow-docket.ts — rebuilds the stored
 * emergency_shadow_docket table from application_details under the
 * current rule (scripts/lib/applications/membership.ts), and prints the
 * applications the rule couldn't classify. No requests to the Court.
 * The application reader also runs this at the end of every run.
 *
 * Run:  npx tsx scripts/rebuild-emergency-shadow-docket.ts
 */

import { getCredentials } from "./lib/sd-db/env.js";
import { reportSdWriteFailure } from "./lib/sd-db/failures.js";
import { rebuildEmergencyShadowDocket } from "./lib/applications/rebuild.js";

const creds = getCredentials();
if (!creds) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
rebuildEmergencyShadowDocket(creds).catch((err) => {
  reportSdWriteFailure("rebuild-emergency-shadow-docket", err);
  process.exitCode = 1;
});
