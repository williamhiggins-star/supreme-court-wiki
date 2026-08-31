#!/usr/bin/env tsx
/**
 * check-precedent-status-derivation.ts
 *
 * Pure unit-style check for derivePrecedentStatus (lib/sd-db/constants.ts)
 * — no database, no credentials, no network. Exists to catch a regression
 * of the exact bug fixed in this commit: a precedent-discovered case with
 * real disposition data (an enriched entry — has a `holding`, a vote
 * count, a majority author) getting capped below "decided" just because
 * of HOW it was discovered, rather than reflecting WHAT is actually known
 * about its disposition.
 *
 * Run: npx tsx scripts/check-precedent-status-derivation.ts
 */

import { derivePrecedentStatus } from "./lib/sd-db/constants.js";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`PASS ${label}: ${JSON.stringify(actual)}`);
  }
}

// A precedent-discovered case with real disposition data (enrich-precedents.ts
// has run — it has a holding, vote count, majority author) must be
// promotable all the way to "decided", not stuck below it because of its
// entry path. This is the exact Clark v. Sweeney bug: discovered via
// Hamm v. Smith's citedPrecedents, later enriched with a full write-up
// confirming it was a real (per curiam summary reversal) decision — and
// previously still landed at status='historic' regardless.
check("enriched precedent (real disposition known) -> decided", derivePrecedentStatus(true), "decided");

// A bare, not-yet-enriched stub has no disposition data at all yet — this
// is the one case where a status less than "decided" is honest, and it
// must stay that way (this check guards against a future edit
// accidentally promoting stubs to "decided" while fixing the enriched
// side of the bug).
check("unenriched stub (no disposition data yet) -> stub", derivePrecedentStatus(false), "stub");

// The removed "historic" status can't come back from this function even
// by accident — its return type is the literal union "decided" | "stub",
// so a future edit reintroducing "historic" fails to compile rather than
// needing a runtime check to catch it (tsc confirms this: comparing the
// result to "historic" is a type error, not just always-false).

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
