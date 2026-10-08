/**
 * fill-party-names.ts
 *
 * One-time fill of cases.petitioner_name / respondent_name for the current
 * term's existing cases, from each case's data/cases/*.json parties. Same
 * rule the daily syncCase now applies to every case it writes
 * (partyNameFill in scripts/lib/sd-db/write.ts): OT2026 on only, blanks
 * only, a stored name is never overwritten. Touches no other column.
 *
 * Run:  npx tsx scripts/fill-party-names.ts [--term 2026] [--dry-run]
 * Exits non-zero if any write fails.
 */

import * as fs from "fs";
import * as path from "path";
import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, update } from "./lib/supabase-sync/client.js";
import { partyNameFill, FIRST_ATTRIBUTED_TERM, type StoredPartyNames } from "./lib/sd-db/write.js";
import { existingSlugForCaseNumber, getExistingCaseSlugs, CASES_DIR } from "./pipeline.js";
import type { CaseSummary } from "../src/types/index.js";

interface CaseRow extends StoredPartyNames {
  id: string;
  slug: string;
  docket_number: string;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const termIdx = argv.indexOf("--term");
  const term = termIdx !== -1 ? argv[termIdx + 1] : "2026";
  if (!term || Number(term) < FIRST_ATTRIBUTED_TERM) {
    throw new Error(`--term must be ${FIRST_ATTRIBUTED_TERM} or later (got "${term}")`);
  }

  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const rows = await select<CaseRow>(
    creds,
    "cases",
    `?term=eq.${term}&docket_number=not.is.null&status=not.in.(stub,historic)&select=id,slug,docket_number,petitioner_name,respondent_name&order=docket_number`,
  );
  const slugs = getExistingCaseSlugs();

  let filled = 0;
  let failed = 0;
  for (const row of rows) {
    // Case JSON is found by exact docket number, as the pipeline does.
    const jsonSlug = existingSlugForCaseNumber(row.docket_number, slugs);
    if (!jsonSlug) {
      console.log(`  - ${row.docket_number} (${row.slug}): no case JSON, skipped`);
      continue;
    }
    const c = JSON.parse(fs.readFileSync(path.join(CASES_DIR, `${jsonSlug}.json`), "utf-8")) as CaseSummary;
    const patch = partyNameFill(row, c.parties ?? [], term);
    if (Object.keys(patch).length === 0) {
      console.log(`  = ${row.docket_number}: nothing blank to fill`);
      continue;
    }
    console.log(`  ${dryRun ? "would fill" : "fill"} ${row.docket_number}: ${JSON.stringify(patch)}`);
    if (dryRun) continue;
    try {
      await update(creds, "cases", `id=eq.${row.id}`, patch);
      filled++;
    } catch (err) {
      failed++;
      console.error(`::error title=SD database write failed::${row.docket_number}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${rows.length} OT${term} case(s); ${dryRun ? "dry run, nothing written" : `${filled} filled`}${failed ? `, ${failed} FAILED` : ""}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
