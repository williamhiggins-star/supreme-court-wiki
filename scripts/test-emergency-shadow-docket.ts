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
import { planNightlyUpdate, type StoredRow } from "./lib/applications/rebuild.js";

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

check("interim relief in with public_view yes; bail in with public_view no; extensions out", () => {
  const built = buildEmergencyShadowDocket(records);
  assert.deepEqual(
    built.rows.map((r) => `${r.docket_number}:${r.defaultPublicView ? "yes" : "no"}`),
    ["25A171:no", "25A312:yes", "25A354:yes", "25A571:yes", "26A400:yes", "26A456:yes", "26A459:yes", "26A476:yes"],
  );
  assert.equal(built.excluded, 1); // 26A1, an extension of time to file
  assert.deepEqual(built.review, []);
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

const m = (type: string | null, text: string) => {
  const r = membership({ application_type: type, application_text: text });
  return `${r.verdict}:${r.publicView ? "yes" : "no"}`;
};

check("public_view no: the Court's wording of the matters held for review under esd-rule-1", () => {
  assert.equal(m(null, "Application (26A516) for an extension of time within which to comply with the order of October 5, 2026, submitted to Justice Kavanaugh."), "in:no");
  assert.equal(m(null, "Application (26A527) to file consolidated brief in opposition in excess of word limits, submitted to Justice Sotomayor."), "in:no");
  assert.equal(m(null, "Application (25A1382) to file a petition for an extraordinary writ of habeas corpus in excess of page limits, submitted to Justice Alito."), "in:no");
  assert.equal(m(null, "Application (25A1399) for a certificate of appealability, submitted to Justice Kagan."), "in:no");
  assert.equal(m("bail", "Application (26A51) for bail, submitted to Justice Alito."), "in:no");
});

check("vacate: public_view yes only when it vacates a stay or injunction; otherwise for review", () => {
  assert.equal(m("vacate", "Application (26A499) to vacate stay, submitted to Justice Sotomayor."), "in:yes");
  assert.equal(m("vacate", "Application (26A428) to vacate stay of execution of sentence of death, submitted to Justice Kavanaugh."), "in:yes");
  assert.equal(m("vacate", "Application (26A9) to vacate injunction, submitted to Justice Kagan."), "in:yes");
  assert.equal(m("vacate", "Application (26A9) to vacate the judgment, submitted to Justice Kagan."), "review:no");
});

check("routine extensions of time to file stay out; unrecognised wording goes for review, never guessed", () => {
  assert.equal(m("extension_cert_petition", "Application (26A1) to extend the time to file a petition for a writ of certiorari …"), "out:no");
  assert.equal(m(null, "Application (26A9) for leave to file under seal, submitted to Justice Kagan."), "review:no");
});

console.log("Rebuild from base records");

check("same base records, same table, whatever the input order", () => {
  assert.deepEqual(buildEmergencyShadowDocket(records), buildEmergencyShadowDocket([...records].reverse()));
});

check("a changed base record changes its row", () => {
  const changed = records.map((r) => (r.docket_number === "26A400" ? { ...r, application_type: "extension_cert_petition" } : r));
  const built = buildEmergencyShadowDocket(changed);
  assert.ok(!built.rows.some((r) => r.docket_number === "26A400"));
  assert.equal(built.excluded, 2);
});

check("an empty base gives an empty table", () => {
  assert.deepEqual(buildEmergencyShadowDocket([]), { rows: [], excluded: 0, review: [] });
});

console.log("Nightly update: public_view for new and changed matters");

const fixture = (no: string) => records.find((r) => r.docket_number === no)!;
/** A test record built from a fixture's facts with the Court's wording for another type. */
const testRecord = (no: string, type: string | null, text: string): ApplicationRecord => ({
  ...fixture("26A400"),
  docket_number: no,
  application_type: type,
  application_text: text,
  docket_url: docketUrl(no),
});
const newMatters = [
  fixture("26A476"), // stay (saved page)
  fixture("25A354"), // partial stay (saved page)
  fixture("26A456"), // stay of execution (saved page)
  fixture("25A571"), // injunction (saved page)
  testRecord("26A901", "vacate", "Application (26A901) to vacate stay, submitted to Justice Sotomayor."),
  testRecord("26A902", "recall_and_stay_mandate", "Application (26A902) to recall and stay the mandate, submitted to Justice Kagan."),
  fixture("25A171"), // bail (saved page)
  testRecord("26A903", null, "Application (26A903) for an extension of time within which to comply with the order of October 5, 2026, submitted to Justice Kavanaugh."),
];
/** The stored table as it would be after a nightly insert. */
const storedFrom = (recs: ApplicationRecord[], byHand: Record<string, boolean> = {}) =>
  new Map<string, StoredRow>(
    buildEmergencyShadowDocket(recs).rows.map(({ defaultPublicView, ...r }) => [
      r.docket_number,
      { ...r, public_view: byHand[r.docket_number] ?? defaultPublicView, public_view_set_by_hand: r.docket_number in byHand },
    ]),
  );
const pv = (rows: { docket_number: string; public_view: boolean }[]) => rows.map((r) => `${r.docket_number}:${r.public_view ? "yes" : "no"}`);

check("2a: each new core matter enters with public_view yes; bail and extension-to-comply with no", () => {
  const plan = planNightlyUpdate(buildEmergencyShadowDocket(newMatters), new Map());
  assert.deepEqual(pv(plan.insert), [
    "25A171:no", // bail
    "25A354:yes", // partial stay
    "25A571:yes", // injunction
    "26A456:yes", // stay of execution
    "26A476:yes", // stay
    "26A901:yes", // vacate a stay
    "26A902:yes", // recall and stay mandate
    "26A903:no", // extension of time to comply
  ]);
  assert.deepEqual([plan.replace, plan.updateFacts, plan.remove], [[], [], []]);
});

check("a night with no changes plans no writes", () => {
  const plan = planNightlyUpdate(buildEmergencyShadowDocket(newMatters), storedFrom(newMatters));
  assert.deepEqual(plan, { insert: [], replace: [], updateFacts: [], remove: [] });
});

const reclassified = (no: string, type: string | null, text: string) =>
  newMatters.map((r) => (r.docket_number === no ? { ...r, application_type: type, application_text: text } : r));

check("2b: a row that becomes core follows the rule to yes; a row that stops being core follows to no", () => {
  const toCore = planNightlyUpdate(
    buildEmergencyShadowDocket(reclassified("25A171", "stay", "Application (25A171) for a stay, submitted to Justice Jackson.")),
    storedFrom(newMatters),
  );
  assert.deepEqual(pv(toCore.replace), ["25A171:yes"]);
  const fromCore = planNightlyUpdate(
    buildEmergencyShadowDocket(reclassified("26A476", "bail", "Application (26A476) for bail, submitted to The Chief Justice.")),
    storedFrom(newMatters),
  );
  assert.deepEqual(pv(fromCore.replace), ["26A476:no"]);
  assert.deepEqual([fromCore.insert, fromCore.updateFacts, fromCore.remove], [[], [], []]);
});

check("2c: a hand-set value survives a reclassification either way (facts refreshed, public_view untouched)", () => {
  const toCore = planNightlyUpdate(
    buildEmergencyShadowDocket(reclassified("25A171", "stay", "Application (25A171) for a stay, submitted to Justice Jackson.")),
    storedFrom(newMatters, { "25A171": false }),
  );
  assert.deepEqual(toCore.replace, []);
  assert.deepEqual(toCore.updateFacts.map((r) => `${r.docket_number}:${r.application_type}`), ["25A171:stay"]);
  assert.ok(!("public_view" in toCore.updateFacts[0]));
  const fromCore = planNightlyUpdate(
    buildEmergencyShadowDocket(reclassified("26A476", "bail", "Application (26A476) for bail, submitted to The Chief Justice.")),
    storedFrom(newMatters, { "26A476": true }),
  );
  assert.deepEqual(fromCore.replace, []);
  assert.deepEqual(fromCore.updateFacts.map((r) => r.docket_number), ["26A476"]);
});

check("2c: a hand-set row that no longer qualifies is kept; an unmarked one is removed", () => {
  const out = reclassified("26A902", "extension_cert_petition", "Application (26A902) to extend the time to file a petition for a writ of certiorari, submitted to Justice Kagan.");
  assert.deepEqual(planNightlyUpdate(buildEmergencyShadowDocket(out), storedFrom(newMatters)).remove, ["26A902"]);
  assert.deepEqual(planNightlyUpdate(buildEmergencyShadowDocket(out), storedFrom(newMatters, { "26A902": true })).remove, []);
});

console.log(`\n${passed} check(s) passed${process.exitCode ? ", some FAILED" : ""}.`);
