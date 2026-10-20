/**
 * test-applications.ts
 *
 * Fixture tests for the application reader (scripts/lib/applications/parse.ts)
 * against real docket pages saved in scripts/fixtures/applications/ (the
 * Attorneys panel removed), plus order texts in scripts/fixtures/orders/.
 *
 * Run:  npx tsx scripts/test-applications.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import {
  applicationNumbersIn,
  applicationTypeOf,
  classifyApplication,
  parseApplicationPage,
  stripContacts,
  type ApplicationPage,
} from "./lib/applications/parse.js";

const DIR = path.join(process.cwd(), "scripts/fixtures");
const page = (n: string) => parseApplicationPage(fs.readFileSync(path.join(DIR, "applications", `${n}.html`), "utf8"));
const actions = (p: ApplicationPage) => classifyApplication(p).actions.map((a) => `${a.date} ${a.action}`);

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

console.log("Application docket pages");

check("26A476: stay to the Chief Justice, administrative stay, referred, granted", () => {
  const p = page("26a476");
  assert.equal(p.docketNumber, "26A476");
  assert.equal(p.title, "Federal Communications Commission, Applicant v. Sherrod Brown, et al.");
  assert.equal(p.docketedDate, "2026-10-08");
  assert.equal(p.lowerCourt, "United States Court of Appeals for the Fourth Circuit");
  assert.equal(p.lowerCourtCaseNumbers, "(26-2230)");
  const c = classifyApplication(p);
  assert.equal(c.applicationType, "stay");
  assert.equal(c.applicationText, "Application (26A476) for a stay, submitted to The Chief Justice.");
  assert.equal(c.directedTo, "The Chief Justice");
  assert.equal(c.filedDate, "2026-10-08");
  assert.equal(c.outcome, "application_granted");
  assert.equal(c.outcomeDate, "2026-10-14");
  assert.match(c.outcomeText!, /^Application \(26A476\) for stay presented to The Chief Justice and by him referred to the Court is granted\./);
  assert.equal(c.pending, false);
  assert.deepEqual(actions(p), ["2026-10-08 administrative_stay", "2026-10-14 referred_to_the_court", "2026-10-14 application_granted"]);
});

check("26A1: extension of time for a cert petition, granted; linked petition kept", () => {
  const p = page("26a1");
  const c = classifyApplication(p);
  assert.equal(c.applicationType, "extension_cert_petition");
  assert.equal(c.directedTo, "Justice Alito");
  assert.equal(c.outcome, "extension_of_time_granted");
  assert.equal(p.linkedWith, "26-486");
  assert.equal(c.pending, false);
});

check("26A456 (capital case): stay of execution denied; the mandamus clause is not the application's", () => {
  const p = page("26a456");
  assert.equal(p.docketNumber, "26A456");
  const c = classifyApplication(p);
  assert.equal(c.applicationType, "stay_of_execution");
  assert.equal(c.outcome, "application_denied");
  assert.deepEqual(actions(p), ["2026-10-07 referred_to_the_court", "2026-10-07 application_denied"]);
});

check("26A459: lower court number with a comma kept verbatim", () => {
  const p = page("26a459");
  assert.equal(p.lowerCourt, "Court of Criminal Appeals of Texas");
  assert.equal(p.lowerCourtCaseNumbers, "(WR-77,906-02)");
  assert.equal(classifyApplication(p).applicationType, "stay_of_execution");
});

check("26A400: 'for a stay of removal' is a stay; denied by the Circuit Justice", () => {
  const c = classifyApplication(page("26a400"));
  assert.equal(c.applicationType, "stay");
  assert.equal(c.outcome, "application_denied");
  assert.equal(c.directedTo, "Justice Kagan");
});

check("25A354: partial stay, response requested, referred, denied", () => {
  const p = page("25a354");
  assert.equal(classifyApplication(p).applicationType, "partial_stay");
  assert.deepEqual(actions(p), [
    "2025-09-26 application_response_requested",
    "2025-10-06 referred_to_the_court",
    "2025-10-06 application_denied",
  ]);
});

check("25A571: injunction denied, refiled with another Justice, then denied by the Court", () => {
  const p = page("25a571");
  const c = classifyApplication(p);
  assert.equal(c.applicationType, "injunction");
  assert.equal(c.directedTo, "Justice Kavanaugh");
  assert.equal(c.outcome, "application_denied");
  assert.equal(c.outcomeDate, "2026-01-12");
  assert.equal(c.pending, false);
  assert.ok(actions(p).includes("2025-11-19 renewed_application"));
});

check("25A171: bail", () => {
  assert.equal(classifyApplication(page("25a171")).applicationType, "bail");
});

check("25A312: deferred pending argument, then denied", () => {
  const p = page("25a312");
  const c = classifyApplication(p);
  assert.equal(c.applicationType, "stay");
  assert.ok(actions(p).includes("2025-10-01 application_deferred"));
  assert.equal(c.outcome, "application_denied");
  assert.equal(c.outcomeDate, "2026-06-29");
  assert.equal(c.pending, false);
});

console.log("Pending");

check("pending while only referred (no disposition yet)", () => {
  const p = page("26a476");
  const c = classifyApplication({ ...p, entries: p.entries.filter((e) => !/is granted/.test(e.text)) });
  assert.equal(c.pending, true);
  assert.equal(c.outcome, "referred_to_the_court");
});

check("pending again after a refiling", () => {
  const p = page("25a571");
  const c = classifyApplication({ ...p, entries: p.entries.filter((e) => e.date <= "2025-11-19") });
  assert.equal(c.pending, true);
  assert.equal(c.outcome, "application_denied"); // the Circuit Justice's denial, before the refiling
});

console.log("Rules the fixtures don't cover");

check("application types from the Court's phrasing", () => {
  assert.equal(applicationTypeOf("to vacate the stay entered by the United States Court of Appeals"), "vacate");
  assert.equal(applicationTypeOf("to recall and stay the mandate of the United States Court of Appeals"), "recall_and_stay_mandate");
  assert.equal(applicationTypeOf("for a writ of injunction"), "injunction");
  assert.equal(applicationTypeOf("to extend the time to file a jurisdictional statement from May 1 to June 1"), "extension_jurisdictional_statement");
  assert.equal(applicationTypeOf("to extend the time to file a petition for rehearing"), "extension_rehearing");
});

check("wording the rules don't recognise gives no type, never a guess", () => {
  assert.equal(applicationTypeOf("for leave to file a brief"), null);
  const p = page("26a400");
  const c = classifyApplication({
    ...p,
    entries: [{ date: "2026-09-23", text: "Application (26A400) for leave to file a brief, submitted to Justice Kagan." }],
  });
  assert.equal(c.applicationType, null);
  assert.equal(c.directedTo, "Justice Kagan");
  assert.equal(c.pending, true);
});

console.log("Contact details and application numbers");

check("emails and phone numbers removed; docket and case numbers kept", () => {
  assert.equal(stripContacts("SUPREMECTBRIEFS@USDOJ.GOV Ph: 202-514-2217"), "[email removed] [phone removed]");
  assert.equal(stripContacts("Ph: 4178343372"), "[phone removed]");
  assert.equal(stripContacts("case No. 26-2230 (WR-77,906-02) 25-1620"), "case No. 26-2230 (WR-77,906-02) 25-1620");
});

check("no email or phone in any parsed fixture", () => {
  for (const f of fs.readdirSync(path.join(DIR, "applications"))) {
    const json = JSON.stringify(page(f.replace(".html", "")));
    assert.doesNotMatch(json, /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/, f);
  }
});

check("application numbers found in order texts", () => {
  const read = (f: string) => fs.readFileSync(path.join(DIR, "orders", f), "utf8");
  assert.deepEqual(applicationNumbersIn(read("100826zr_b97c.txt"), ["26", "25"]), ["26A476"]);
  assert.deepEqual(applicationNumbersIn(read("100726zr_o7jp.txt") + read("100726zr1_08m1.txt"), ["26", "25"]).sort(), ["26A456", "26A459"]);
  assert.deepEqual(applicationNumbersIn("Nos. 24A100 and 26A007", ["26", "25"]), ["26A7"]);
});

console.log(`\n${passed} check(s) passed${process.exitCode ? ", some FAILED" : ""}.`);
