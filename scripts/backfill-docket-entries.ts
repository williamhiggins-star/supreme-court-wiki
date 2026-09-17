#!/usr/bin/env tsx
/**
 * backfill-docket-entries.ts
 *
 * One-off PILOT backfill: fetches, parses, and classifies docket
 * proceedings for Suncor (25-170) ONLY, writing into public.docket_entries.
 * Deliberately not general-purpose yet -- do NOT widen PILOT_CASE_NUMBERS
 * below without explicit direction. This is step one of a two-phase
 * rollout; step two wires daily re-fetch/re-parse for every non-decided
 * case (plus one final fetch on decision) and backfills every other case.
 *
 * Requires supabase/migrations/20260918000000_docket_entries.sql to
 * already be applied by hand in the Supabase SQL Editor -- this script
 * does not apply migrations.
 *
 * Idempotent: deletes this case's existing docket_entries rows before
 * inserting the freshly-parsed set, so it's safe to re-run after a
 * classifier tweak.
 *
 * Run:  npx tsx scripts/backfill-docket-entries.ts
 */

import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, remove, insert } from "./lib/supabase-sync/client.js";
import {
  fetchDocketProceedingsHtml,
  parseDocketProceedingsHtml,
  classifyDocketEntries,
} from "./lib/docket-proceedings.js";

const PILOT_CASE_NUMBERS = ["25-170"];

interface CaseRow {
  id: string;
  slug: string;
  docket_number: string | null;
}

async function main() {
  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  for (const caseNumber of PILOT_CASE_NUMBERS) {
    console.log(`\n=== ${caseNumber} ===`);

    const rows = await select<CaseRow>(
      creds,
      "cases",
      `?docket_number=eq.${encodeURIComponent(caseNumber)}&select=id,slug,docket_number`,
    );
    const caseRow = rows[0];
    if (!caseRow) {
      console.error(`  No cases row found for docket_number ${caseNumber} -- skipping`);
      continue;
    }

    console.log(`  Fetching docket page...`);
    const html = await fetchDocketProceedingsHtml(caseNumber);
    const parsed = parseDocketProceedingsHtml(html);
    const types = classifyDocketEntries(parsed);
    console.log(`  Parsed ${parsed.length} proceeding entries.`);

    const rowsToInsert = parsed.map((e, i) => ({
      case_id: caseRow.id,
      entry_date: e.date,
      description: e.description,
      document_type: types[i],
      sort_order: e.sortOrder,
      documents: e.documents,
    }));

    await remove(creds, "docket_entries", `case_id=eq.${caseRow.id}`);
    await insert(creds, "docket_entries", rowsToInsert);

    const counts: Record<string, number> = {};
    for (const t of types) counts[t] = (counts[t] ?? 0) + 1;

    console.log(`  ✓ ${caseRow.slug}: ${rowsToInsert.length} entries written`);
    console.log(`  by type: ${JSON.stringify(counts)}`);
    console.log("  sample (first, middle, last):");
    for (const i of [0, Math.floor(parsed.length / 2), parsed.length - 1]) {
      if (!parsed[i]) continue;
      console.log(`    ${parsed[i].date} [${types[i]}] ${parsed[i].description.slice(0, 80)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
