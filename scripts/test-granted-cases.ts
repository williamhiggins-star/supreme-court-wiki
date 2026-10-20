/**
 * test-granted-cases.ts
 *
 * Step (c) guardrails:
 *   1. The Granted & Noted List parser, against the real OT2026 list
 *      (scripts/fixtures/orders/26grantednotedlist-2026-10-13.txt).
 *   2. getAllCasesForTerm (src/lib/db/cases.ts, the site's read path for
 *      The Docket and All Cases) drops a `granted` row by its own query,
 *      even with the database's anon read policy out of the picture: the
 *      Supabase REST API is replaced by a stand-in that applies the
 *      function's own filters to a row set that includes a granted case.
 *
 * Run:  npx tsx scripts/test-granted-cases.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parseGrantedNotedList } from "./lib/court-orders/granted-cases.js";

let passed = 0;
async function check(label: string, fn: () => void | Promise<void>) {
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

async function main() {
  console.log("Granted & Noted List, OT2026, as of October 13, 2026");
  const list = parseGrantedNotedList(
    fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/orders/26grantednotedlist-2026-10-13.txt"), "utf8"),
  );
  await check("term, date, and all 33 entries accounted for (32 grants, 1 disposed)", () => {
    assert.equal(list.term, "2026");
    assert.equal(list.asOf, "2026-10-13");
    assert.equal(list.grants.length, 32);
    assert.deepEqual(list.disposed, ["25-886"]);
    assert.deepEqual(list.skipped, []);
  });
  await check("grant date, action and the list's own words", () => {
    const g = list.grants.find((x) => x.docketNumber === "25-1311")!;
    assert.equal(g.action, "petition_granted");
    assert.equal(g.grantedDate, "2026-06-30");
    assert.equal(g.courtText, "25-1311 CFX APPLE INC. V. EPIC GAMES, INC.\nCourt: USCA-9  Granted: 6/30/26");
  });
  await check("a bracketed pair shares one grant date", () => {
    const pair = list.grants.filter((x) => x.docketNumber === "25-238" || x.docketNumber === "25-566");
    assert.equal(pair.length, 2);
    for (const g of pair) assert.equal(g.grantedDate, "2026-06-30");
  });

  console.log("getAllCasesForTerm never returns a granted case");
  const rows = [
    { id: "a", slug: "26-1-set-for-argument", status: "set_for_argument", term: "2026" },
    { id: "b", slug: "26-2-argued", status: "argued", term: "2026" },
    // Not how the seed writes it (term stays null until an argument date
    // exists); term 2026 here so only the status filter can drop it.
    { id: "c", slug: "26-3-granted", status: "granted", term: "2026" },
    { id: "d", slug: "stub-precedent", status: "stub", term: "2026" },
  ].map((r) => ({
    ...r, caption: r.slug, docket_number: null, question_presented: null, background: null, significance: null,
    argued_date: null, decided_date: null, vote_line: null, disposition: null, updated_at: "2026-10-20T00:00:00Z",
    petitioner_name: null, petitioner_argument: null, petitioner_supporting_points: [],
    respondent_name: null, respondent_argument: null, respondent_supporting_points: [],
    case_lower_courts: [], issue_category: null, opinions: [], oral_argument_transcripts: [],
    case_podcast_episodes: [], key_exchanges: [], docket_entries: [],
  }));
  const queried: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    let out: Record<string, unknown>[] = [];
    if (table === "cases") {
      queried.push(url.search);
      out = rows.filter((r) =>
        [...url.searchParams].every(([k, v]) => {
          if (["select", "order", "limit", "offset"].includes(k)) return true;
          const val = String((r as Record<string, unknown>)[k]);
          if (v.startsWith("eq.")) return val === v.slice(3);
          if (v.startsWith("in.(")) return v.slice(4, -1).split(",").map((x) => x.replace(/"/g, "")).includes(val);
          throw new Error(`stand-in can't apply ${k}=${v}`);
        }),
      );
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  process.env.SUPABASE_URL = "http://stand-in.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "stand-in";
  const { getAllCasesForTerm } = await import("../src/lib/db/cases.js");

  await check("the granted row (and the stub) are dropped; set-for-argument and argued stay", async () => {
    const got = (await getAllCasesForTerm("2026")).map((c) => c.slug).sort();
    assert.deepEqual(got, ["26-1-set-for-argument", "26-2-argued"]);
    assert.equal(queried.length, 1);
    assert.ok(!decodeURIComponent(queried[0]).includes("granted"), queried[0]);
  });

  console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
}

main();
