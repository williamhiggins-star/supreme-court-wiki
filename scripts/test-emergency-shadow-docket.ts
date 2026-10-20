/**
 * test-emergency-shadow-docket.ts
 *
 * The membership rule (scripts/lib/applications/membership.ts) and the
 * rebuild: base records are built from the saved docket pages in
 * scripts/fixtures/applications/ exactly as the reader builds them.
 *
 * Run:  npx tsx scripts/test-emergency-shadow-docket.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { classifyApplication, docketUrl, parseApplicationPage, termOf } from "./lib/applications/parse.js";
import { RULE_VERSION, buildEmergencyShadowDocket, membership, type ApplicationRecord } from "./lib/applications/membership.js";

const DIR = path.join(process.cwd(), "scripts/fixtures/applications");

/** A fixture page → the application_details row the reader writes. */
function record(file: string): ApplicationRecord {
  const p = parseApplicationPage(fs.readFileSync(path.join(DIR, file), "utf8"));
  const c = classifyApplication(p);
  return {
    docket_number: p.docketNumber,
    term: termOf(p.docketNumber),
    title: p.title,
    application_type: c.applicationType,
    application_text: c.applicationText,
    directed_to: c.directedTo,
    filed_date: c.filedDate,
    outcome: c.outcome,
    outcome_date: c.outcomeDate,
    outcome_text: c.outcomeText,
    pending: c.pending,
    docket_url: docketUrl(p.docketNumber),
  };
}
const records = fs.readdirSync(DIR).sort().map(record);

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

console.log(`Membership rule ${RULE_VERSION}`);

check("interim relief in, extensions out, bail unclassified", () => {
  const built = buildEmergencyShadowDocket(records);
  assert.deepEqual(built.rows.map((r) => r.docket_number), ["25A312", "25A354", "25A571", "26A400", "26A456", "26A459", "26A476"]);
  assert.equal(built.excluded, 1); // 26A1, an extension of time
  assert.deepEqual(built.unclassified.map((u) => u.docket_number), ["25A171"]);
});

check("each row carries the rule version and the Court's own terms", () => {
  const row = buildEmergencyShadowDocket(records).rows.find((r) => r.docket_number === "26A476")!;
  assert.equal(row.rule_version, RULE_VERSION);
  assert.equal(row.application_type, "stay");
  assert.equal(row.application_text, "Application (26A476) for a stay, submitted to The Chief Justice.");
  assert.equal(row.outcome, "application_granted");
  assert.match(row.outcome_text!, /referred to the Court is granted/);
  assert.equal(row.docket_url, "https://www.supremecourt.gov/docket/docketfiles/html/public/26a476.html");
});

check("vacate: in only when it vacates a stay or injunction", () => {
  const v = (text: string) => membership({ application_type: "vacate", application_text: text }).verdict;
  assert.equal(v("Application (26A9) to vacate the stay entered by the United States Court of Appeals, submitted to Justice Kagan."), "in");
  assert.equal(v("Application (26A9) to vacate the administrative stay, submitted to Justice Kagan."), "in");
  assert.equal(v("Application (26A9) to vacate injunction, submitted to Justice Kagan."), "in");
  assert.equal(v("Application (26A9) to vacate the judgment, submitted to Justice Kagan."), "unclassified");
});

check("an unrecognised type is never guessed", () => {
  assert.equal(membership({ application_type: null, application_text: "Application (26A9) for leave, submitted to Justice Kagan." }).verdict, "unclassified");
});

console.log("Rebuild");

check("rebuilding from the same base records gives the same table, whatever the input order", () => {
  const a = buildEmergencyShadowDocket(records);
  const b = buildEmergencyShadowDocket([...records].reverse());
  assert.deepEqual(a, b);
});

check("rebuilding after a base record changes follows the change", () => {
  const changed = records.map((r) => (r.docket_number === "26A400" ? { ...r, application_type: "extension_cert_petition" } : r));
  const built = buildEmergencyShadowDocket(changed);
  assert.ok(!built.rows.some((r) => r.docket_number === "26A400"));
  assert.equal(built.excluded, 2);
});

check("an empty base gives an empty table", () => {
  assert.deepEqual(buildEmergencyShadowDocket([]), { rows: [], excluded: 0, unclassified: [] });
});

console.log(`\n${passed} check(s) passed${process.exitCode ? ", some FAILED" : ""}.`);
