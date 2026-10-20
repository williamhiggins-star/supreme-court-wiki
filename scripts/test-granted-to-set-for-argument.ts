/**
 * test-granted-to-set-for-argument.ts
 *
 * Integration test, granted → set for argument, against a DISPOSABLE
 * database (a local Postgres + PostgREST built from supabase/migrations),
 * never the SD or DYSTL project:
 *
 *   1. A grant creates a `granted` cases row (ensureGrantedCase): docket
 *      number, Court-caption slug, nothing else; the grant is linked; the
 *      anon role can't read the row.
 *   2. The calendar step's write (syncCase, with a real OT2026 case file
 *      from data/cases) finds that same row by exact docket number and
 *      updates it to `set_for_argument`
 *      with its argument date and term: same id, same slug, no second row.
 *      A second sync changes nothing; after the argument it moves to `argued`.
 *
 * The Court's docket page is stubbed; no request leaves the machine.
 *
 * Run:  TEST_SUPABASE_URL=http://127.0.0.1:54331 \
 *       TEST_SUPABASE_SERVICE_ROLE_KEY=<service JWT> TEST_SUPABASE_ANON_KEY=<anon JWT> \
 *       npx tsx scripts/test-granted-to-set-for-argument.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import type { SupabaseCredentials } from "./lib/sd-db/env.js";
import { insert, remove, select } from "./lib/sd-db/client.js";
import { loadIdCache, syncCase } from "./lib/sd-db/write.js";
import { CourtFetcher } from "./lib/court-orders/fetch.js";
import { ensureGrantedCase } from "./lib/court-orders/granted-cases.js";
import type { CaseSummary } from "../src/types/index.js";

const url = process.env.TEST_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";
if (!url || !serviceRoleKey || !anonKey) {
  console.log("TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY / TEST_SUPABASE_ANON_KEY not set: skipped (needs a disposable database).");
  process.exit(0);
}
if (/enwjtgjycthjypeqdgfo|bclgsfgcdxxfayonynvl|supabase\.co/.test(url)) throw new Error("refusing to run against a real Supabase project");
const creds: SupabaseCredentials = { url, serviceRoleKey };

// The case the calendar step would write: a real OT2026 case file.
const summary: CaseSummary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/cases/25-1003-guerrero-v-johnson.json"), "utf8"));
const DOCKET = summary.caseNumber;
// A docket-page caption that gives a different slug from the JSON file's,
// to prove the row keeps the slug it was created with.
const DOCKET_PAGE = `<table><tr><td>Title:</td><td>Gabriel Guerrero, Petitioner<br>v.<br>Eric Guerrero, Director, Texas Department of Criminal Justice</td></tr></table>`;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (u.startsWith("https://www.supremecourt.gov/docket/")) return new Response(DOCKET_PAGE, { status: 200 });
  if (!u.startsWith(url)) throw new Error(`unexpected request to ${u}`);
  return realFetch(input, init);
}) as typeof fetch;

let passed = 0;
async function check(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

type Row = { id: string; slug: string; status: string; term: string | null; argued_date: string | null; sitting: string | null; caption: string };
const rowsForDocket = () =>
  select<Row>(creds, "cases", `?select=id,slug,status,term,argued_date,sitting,caption&docket_number=eq.${DOCKET}`);

async function main() {
  // Clean slate for re-runs.
  await remove(creds, "court_actions", `docket_number=eq.${DOCKET}`);
  await remove(creds, "cases", `docket_number=eq.${DOCKET}`);
  const [scotus] = await select<{ id: string }>(creds, "courts", "?select=id&slug=eq.scotus");

  console.log(`Grant → granted case (${DOCKET})`);
  const [grant] = await insert<{ id: string }>(creds, "court_actions", [{
    docket_number: DOCKET, action: "petition_granted", action_date: "2026-06-15", term: "2026",
    court_text: "25-1003 CFH GUERRERO V. JOHNSON\nCourt: USCA-5  Granted: 6/15/26", source_url: "test", source_sha256: "test",
  }]);
  const ensured = await ensureGrantedCase(creds, new CourtFetcher(5), scotus.id, DOCKET);
  let granted: Row;
  await check("one granted row: docket, Court-caption slug, no term/sitting/argument date", async () => {
    const rows = await rowsForDocket();
    assert.equal(rows.length, 1);
    granted = rows[0];
    assert.equal(ensured.created, true);
    assert.equal(granted.slug, "25-1003-gabriel-guerrero-v-eric-guerrero");
    assert.equal(granted.caption, "Gabriel Guerrero v. Eric Guerrero");
    assert.deepEqual([granted.status, granted.term, granted.argued_date, granted.sitting], ["granted", null, null, null]);
  });
  await check("the grant is linked to it", async () => {
    const [a] = await select<{ case_id: string }>(creds, "court_actions", `?select=case_id&id=eq.${grant.id}`);
    assert.equal(a.case_id, granted.id);
  });
  await check("anon can't read it", async () => {
    const res = await realFetch(`${url}/rest/v1/cases?select=id&docket_number=eq.${DOCKET}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
    assert.deepEqual(await res.json(), []);
  });
  await check("a second grant for the same docket links the same row, creates nothing", async () => {
    const again = await ensureGrantedCase(creds, new CourtFetcher(5), scotus.id, DOCKET);
    assert.deepEqual([again.caseId, again.created], [granted.id, false]);
    assert.equal((await rowsForDocket()).length, 1);
  });

  console.log("Calendar step finds the docket → set for argument");
  const result = await syncCase(creds, await loadIdCache(creds), summary);
  await check("same row updated to set_for_argument with its argument date and term; same id and slug; no new row", async () => {
    const rows = await rowsForDocket();
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.id, granted.id);
    assert.equal(r.slug, granted.slug);
    assert.deepEqual([r.status, r.argued_date, r.term], ["set_for_argument", "2026-11-04", "2026"]);
    assert.equal((await select(creds, "cases", `?select=id&slug=eq.${summary.slug}`)).length, 0, "no row under the JSON file's slug");
    assert.ok(result.warnings.some((w) => w.includes(`already stored as "${granted.slug}"`)), "syncCase reports the kept slug");
  });
  await check("the grant stays linked; a second sync changes nothing", async () => {
    await syncCase(creds, await loadIdCache(creds), summary);
    const rows = await rowsForDocket();
    assert.deepEqual(rows.map((r) => [r.id, r.slug, r.status]), [[granted.id, granted.slug, "set_for_argument"]]);
    const [a] = await select<{ case_id: string }>(creds, "court_actions", `?select=case_id&id=eq.${grant.id}`);
    assert.equal(a.case_id, granted.id);
  });
  await check("once set for argument, anon can read it", async () => {
    const res = await realFetch(`${url}/rest/v1/cases?select=id&docket_number=eq.${DOCKET}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
    assert.deepEqual(await res.json(), [{ id: granted.id }]);
  });

  console.log("After the argument (the case file says argued) → argued");
  await check("same row moves to argued; no new row", async () => {
    await syncCase(creds, await loadIdCache(creds), { ...summary, docketStatus: "petition" });
    const rows = await rowsForDocket();
    assert.deepEqual(rows.map((r) => [r.id, r.slug, r.status, r.argued_date]), [[granted.id, granted.slug, "argued", "2026-11-04"]]);
  });

  console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
