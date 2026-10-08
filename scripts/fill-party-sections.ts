/**
 * fill-party-sections.ts
 *
 * One-time fill of each existing case's Petitioner/Respondent section
 * columns for one term: petitioner_name/respondent_name from the Court's
 * own caption (docket page), and *_argument/*_supporting_points from the
 * case's data/cases/*.json parties. Same rule the daily syncCase applies
 * to every case it writes (partyFieldsFill in scripts/lib/sd-db/write.ts):
 * OT2026 on only, blanks only, a stored value is never overwritten.
 * Touches no other column.
 *
 * Run:  npx tsx scripts/fill-party-sections.ts [--term 2026] [--dry-run]
 * Exits non-zero if any read or write fails.
 */

import * as fs from "fs";
import * as path from "path";
import { getCredentials } from "./lib/sd-db/env.js";
import { select, update } from "./lib/sd-db/client.js";
import {
  partyFieldsFill,
  needsCaptionParties,
  FIRST_ATTRIBUTED_TERM,
  PARTY_FIELD_COLUMNS,
  type StoredPartyFields,
} from "./lib/sd-db/write.js";
import { courtCaptionParties, fetchCourtDocketTitle } from "./lib/court-caption.js";
import { existingSlugForCaseNumber, getExistingCaseSlugs, CASES_DIR } from "./pipeline.js";
import type { CaseSummary } from "../src/types/index.js";

interface CaseRow extends StoredPartyFields {
  id: string;
  slug: string;
  docket_number: string;
}

// robots.txt asks for one request per second.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    `?term=eq.${term}&docket_number=not.is.null&status=not.in.(stub,historic)&select=id,slug,docket_number,${PARTY_FIELD_COLUMNS}&order=docket_number`,
  );
  const slugs = getExistingCaseSlugs();

  let filled = 0;
  let failed = 0;
  for (const row of rows) {
    // Case JSON is found by exact docket number, as the pipeline does.
    const jsonSlug = existingSlugForCaseNumber(row.docket_number, slugs);
    const c = jsonSlug
      ? (JSON.parse(fs.readFileSync(path.join(CASES_DIR, `${jsonSlug}.json`), "utf-8")) as CaseSummary)
      : null;

    let caption = null;
    if (needsCaptionParties(row, term)) {
      try {
        caption = courtCaptionParties(await fetchCourtDocketTitle(row.docket_number));
        if (!caption) console.warn(`  ! ${row.docket_number}: Court caption has no "Petitioner v. Respondent" shape`);
      } catch (err) {
        failed++;
        console.error(`::error title=Court caption read failed::${row.docket_number}: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(1100);
    }

    const patch = partyFieldsFill(row, caption, c?.parties ?? [], term);
    if (Object.keys(patch).length === 0) {
      console.log(`  = ${row.docket_number}: nothing blank to fill${c ? "" : " (no case JSON)"}`);
      continue;
    }
    console.log(`  ${dryRun ? "would fill" : "fill"} ${row.docket_number}: ${Object.keys(patch).join(", ")}`);
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
