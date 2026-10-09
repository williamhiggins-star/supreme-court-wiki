/**
 * test-key-exchange-writes.ts
 *
 * Guardrail test for syncCase's key_exchanges write (planKeyExchangeWrites
 * in scripts/lib/sd-db/write.ts): a re-sync fills blanks and never deletes
 * or overwrites, so the one-off OT2025 role/context backfill survives, and
 * role/context are only written from OT2026 on.
 *
 * Run:  npx tsx scripts/test-key-exchange-writes.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import {
  planKeyExchangeWrites,
  type StoredKeyExchange,
  type WantedKeyExchange,
} from "./lib/sd-db/write.js";

let passed = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

const wanted = (exchange: string, role: string, context: string | null = "ctx"): WantedKeyExchange => ({
  justice_person_slug: "elena-kagan",
  exchange,
  significance: "sig",
  role,
  context,
});
const stored = (id: string, exchange: string, role: string | null, context: string | null): StoredKeyExchange => ({
  id,
  exchange,
  role,
  context,
});

console.log("key_exchanges write plan");

check("OT2025 case with backfilled roles: a re-sync changes nothing", () => {
  const plan = planKeyExchangeWrites(
    [stored("1", "Q1", "petitioner", "c1"), stored("2", "Q2", "respondent", "c2")],
    [wanted("Q1", "petitioner"), wanted("Q2", "respondent")],
    "2025",
  );
  assert.deepEqual(plan, { inserts: [], fills: [] });
});

check("OT2025 row the backfill couldn't attribute stays unattributed (earlier terms untouched)", () => {
  const plan = planKeyExchangeWrites([stored("1", "Q1", null, null)], [wanted("Q1", "petitioner")], "2025");
  assert.deepEqual(plan, { inserts: [], fills: [] });
});

check("OT2026 stored row with empty role/context gets them filled", () => {
  const plan = planKeyExchangeWrites([stored("1", "Q1", null, null)], [wanted("Q1", "petitioner", "why")], "2026");
  assert.deepEqual(plan.fills, [{ id: "1", patch: { role: "petitioner", context: "why" } }]);
  assert.deepEqual(plan.inserts, []);
});

check("OT2026 never overwrites a non-empty role or context", () => {
  const plan = planKeyExchangeWrites([stored("1", "Q1", "respondent", "kept")], [wanted("Q1", "petitioner", "new")], "2026");
  assert.deepEqual(plan, { inserts: [], fills: [] });
});

check("OT2026 case with existing roles keeps them after a second re-sync", () => {
  const rows = [stored("1", "Q1", "petitioner", "c1"), stored("2", "Q2", "respondent", "c2")];
  const want = [wanted("Q1", "petitioner"), wanted("Q2", "respondent")];
  assert.deepEqual(planKeyExchangeWrites(rows, want, "2026"), { inserts: [], fills: [] });
});

check("a new exchange is inserted with role/context from OT2026, without them before", () => {
  assert.deepEqual(planKeyExchangeWrites([], [wanted("Q9", "respondent", "c9")], "2026").inserts, [wanted("Q9", "respondent", "c9")]);
  const old = planKeyExchangeWrites([], [wanted("Q9", "respondent", "c9")], "2025").inserts;
  assert.equal(old[0].role, "");
  assert.equal(old[0].context, null);
});

check("stored rows missing from the JSON are kept (the plan has no deletes)", () => {
  const plan = planKeyExchangeWrites([stored("1", "Q-old", "petitioner", "c")], [wanted("Q-new", "petitioner")], "2026");
  assert.deepEqual(Object.keys(plan).sort(), ["fills", "inserts"]);
  assert.equal(plan.inserts.length, 1);
});

check("duplicate JSON exchanges are inserted once", () => {
  const plan = planKeyExchangeWrites([], [wanted("Q1", "petitioner"), wanted("Q1", "petitioner")], "2026");
  assert.equal(plan.inserts.length, 1);
});

check("syncCase no longer deletes key_exchanges rows", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "lib", "sd-db", "write.ts"), "utf-8");
  assert.doesNotMatch(src, /remove\(\s*creds,\s*"key_exchanges"/);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
