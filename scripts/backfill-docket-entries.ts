#!/usr/bin/env tsx
/**
 * backfill-docket-entries.ts
 *
 * Fetches, parses, and classifies docket proceedings for every
 * docket-relevant case (decided/argued/upcoming/petition -- NOT the
 * historic/stub precedent-citation stubs, which have no real docket page
 * and, confirmed against live data, are also the only rows with no
 * docket_number at all) in the tracked terms, writing into
 * public.docket_entries.
 *
 * Originally a Suncor (25-170)-only pilot; now general-purpose per Will's
 * direction after reviewing the pilot panel. Still not wired into the
 * daily cron -- this is a manual backfill run, not a scheduled step.
 *
 * Idempotent: deletes each case's existing docket_entries rows before
 * inserting the freshly-parsed set, so it's safe to re-run (e.g. after a
 * classifier tweak, or to pick up new filings on a case already backfilled).
 *
 * Run:
 *   npx tsx scripts/backfill-docket-entries.ts              # every tracked-term, docket-relevant case
 *   npx tsx scripts/backfill-docket-entries.ts 25-170 25-95  # just these cases, by docket number
 *   npx tsx scripts/backfill-docket-entries.ts --dry-run     # fetch+parse+classify only, no writes
 */

import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, remove, insert } from "./lib/supabase-sync/client.js";
import {
  fetchDocketProceedingsHtml,
  parseDocketProceedingsHtml,
  classifyDocketEntries,
} from "./lib/docket-proceedings.js";

// Same rolling window as the rest of the term-rollover work (Phase 1/4/5)
// -- bump by hand each October when a new term starts.
const TRACKED_TERMS = ["2025", "2026"];
// Excludes historic/stub precedent-citation stubs -- confirmed against
// live data (2026-09-18) that all 15 term-2025/2026 rows with no
// docket_number are stub/historic, and all 88 decided/argued/upcoming/
// petition rows DO have one, so filtering on status here is equivalent to
// filtering on "has a real docket page" without guessing at URLs for rows
// that were never real SCOTUS oral-argument-calendar cases.
const DOCKET_RELEVANT_STATUSES = ["decided", "argued", "upcoming", "petition"];

const REQUEST_DELAY_MS = 300; // politeness delay between requests to supremecourt.gov

interface CaseRow {
  id: string;
  slug: string;
  docket_number: string | null;
  term: string | null;
  status: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const explicitCaseNumbers = args.filter((a) => !a.startsWith("--"));

  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  let cases: CaseRow[];
  if (explicitCaseNumbers.length) {
    cases = await select<CaseRow>(
      creds,
      "cases",
      `?docket_number=in.(${explicitCaseNumbers.map(encodeURIComponent).join(",")})&select=id,slug,docket_number,term,status`,
    );
  } else {
    const rows = await select<CaseRow>(
      creds,
      "cases",
      `?term=in.(${TRACKED_TERMS.join(",")})&status=in.(${DOCKET_RELEVANT_STATUSES.join(",")})&select=id,slug,docket_number,term,status&order=term.asc,docket_number.asc`,
    );
    cases = rows.filter((c) => c.docket_number);
  }

  console.log(`${cases.length} case(s) to process.${dryRun ? " (--dry-run: no writes)" : ""}\n`);

  let processed = 0;
  let totalEntries = 0;
  const failures: { caseNumber: string; slug: string; error: string }[] = [];

  for (const c of cases) {
    // cases.docket_number sometimes carries a "(consolidated with N)"
    // suffix (e.g. mullin-v-doe: "25-1083 (consolidated with 25-1084)")
    // -- same normalization backfill-oral-argument-transcripts.ts already
    // uses for the same reason: the docket PAGE only exists at the primary
    // docket number's own URL.
    const rawDocketNumber = c.docket_number!;
    const caseNumber = rawDocketNumber.replace(/\s*\(consolidated.*$/i, "").trim();
    process.stdout.write(`${c.slug} (${rawDocketNumber})... `);
    try {
      const html = await fetchDocketProceedingsHtml(caseNumber);
      const parsed = parseDocketProceedingsHtml(html);
      const types = classifyDocketEntries(parsed);

      if (!dryRun) {
        const rowsToInsert = parsed.map((e, i) => ({
          case_id: c.id,
          entry_date: e.date,
          description: e.description,
          document_type: types[i],
          sort_order: e.sortOrder,
          documents: e.documents,
        }));
        await remove(creds, "docket_entries", `case_id=eq.${c.id}`);
        await insert(creds, "docket_entries", rowsToInsert);
      }

      console.log(`${parsed.length} entries`);
      processed++;
      totalEntries += parsed.length;
    } catch (err) {
      const message = (err as Error).message;
      console.log(`FAILED: ${message}`);
      failures.push({ caseNumber, slug: c.slug, error: message });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Cases processed : ${processed}/${cases.length}`);
  console.log(`  Total entries   : ${totalEntries}`);
  console.log(`  Failures        : ${failures.length}`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  ${f.slug} (${f.caseNumber}): ${f.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
