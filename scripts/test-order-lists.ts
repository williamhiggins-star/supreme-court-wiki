/**
 * test-order-lists.ts
 *
 * Fixture tests for the order-list reader (scripts/lib/court-orders/parse.ts)
 * against real Court pages saved in scripts/fixtures/orders/: the OT2026
 * Orders of the Court listing, and order PDFs as `pdftotext -layout` text.
 *
 * Run:  npx tsx scripts/test-order-lists.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parseOrderText, parseOrdersListing, type ParsedAction } from "./lib/court-orders/parse.js";

const DIR = path.join(process.cwd(), "scripts/fixtures/orders");
const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");

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

const of = (actions: ParsedAction[], code: string) => actions.filter((a) => a.action === code).map((a) => a.docketNumber);

console.log("Orders of the Court listing (OT2026)");
check("lists every order PDF with its date, label and absolute URL", () => {
  const listed = parseOrdersListing(read("ordersofthecourt-26.html"));
  assert.equal(listed.length, 4);
  assert.deepEqual(listed[3], {
    listedDate: "10/05/26",
    url: "https://www.supremecourt.gov/orders/courtorders/100526zor_2a34.pdf",
    label: "Order List",
  });
  assert.equal(listed.filter((o) => o.label === "Miscellaneous Order").length, 3);
});

console.log("Order list, October 5, 2026");
const oct5 = parseOrderText(read("100526zor_2a34.txt"));
check("order date", () => assert.equal(oct5.orderDate, "2026-10-05"));
check("7 grants-vacated-remanded, grouped dockets share the Court's text", () => {
  assert.deepEqual(of(oct5.actions, "granted_vacated_remanded"), ["25-901", "25-918", "25-7462", "25-7532", "26-48", "26-5053", "26-5165"]);
  const garcia = oct5.actions.find((a) => a.docketNumber === "25-901")!;
  assert.match(garcia.courtText, /^25-901 GARCIA, BENANCIO V\. HOBBS.*\n25-918 TREVINO.*\nThe petitions for writs of certiorari are granted\. The judgments are vacated/);
});
check("745 denials; the 6 Rule 39.8 dismissals are not denials", () => {
  const denied = of(oct5.actions, "petition_denied");
  assert.equal(denied.length, 745);
  for (const n of ["25-7548", "25-7666", "25-7693", "26-5040", "26-5088", "26-5130"]) assert.ok(!denied.includes(n), n);
});
check("plain denial keeps the heading and the docket line; first line on a page is not lost", () => {
  const a = oct5.actions.find((x) => x.docketNumber === "25-1145")!;
  assert.equal(a.courtText, "CERTIORARI DENIED\n25-1145 COUNCIL RESPONSIBLE NUTRITION V. JAMES, LETITIA");
  assert.ok(oct5.actions.some((x) => x.docketNumber === "25-1375"));
});
check("denial with a recusal note keeps the note", () => {
  const a = oct5.actions.find((x) => x.docketNumber === "25-1089")!;
  assert.equal(a.action, "petition_denied");
  assert.match(a.courtText, /Justice Alito took no part in the consideration or decision of this petition\.$/);
});
check("applications, motions and original actions are skipped", () => {
  assert.ok(oct5.actions.every((a) => /^\d{2}-\d+$/.test(a.docketNumber)));
  assert.equal(oct5.unknownHeadings.length, 0);
});

console.log("Order list, June 30, 2026");
const jun30 = parseOrderText(read("063026zor_3f14.txt"));
check("grants, including a bracketed pair and a limited grant", () => {
  assert.deepEqual(of(jun30.actions, "petition_granted"), ["25-238", "25-566", "25-965"]);
  assert.deepEqual(of(jun30.actions, "granted_limited_to_question"), ["25-1311"]);
  const apple = jun30.actions.find((a) => a.docketNumber === "25-1311")!;
  assert.equal(apple.courtText, "25-1311 APPLE INC. V. EPIC GAMES, INC.\nThe petition for a writ of certiorari is granted limited to Question 1 presented by the petition.");
});
check("7 grants-vacated-remanded and 12 denials", () => {
  assert.equal(of(jun30.actions, "granted_vacated_remanded").length, 7);
  assert.equal(of(jun30.actions, "petition_denied").length, 12);
});

console.log("Order list, December 8, 2025 (per curiam attached)");
const dec8 = parseOrderText(read("120825zor_i4ek.txt"));
check("per curiam in Doe v. Dynamic Physical Therapy is a summary disposition", () => {
  const sd = dec8.actions.filter((a) => a.action === "summary_disposition");
  assert.equal(sd.length, 1);
  assert.equal(sd[0].docketNumber, "25-180");
  assert.equal(sd[0].actionDate, "2025-12-08");
  assert.equal(
    sd[0].courtText,
    "The petition for certiorari is granted, the judgment of the Louisiana Court of Appeal is reversed, and the case is remanded for further proceedings not inconsistent with this opinion. It is so ordered.",
  );
});
check("a statement respecting denial is not a summary disposition", () => {
  assert.ok(!dec8.actions.some((a) => a.docketNumber === "24-7435" && a.action === "summary_disposition"));
  assert.deepEqual(of(dec8.actions, "granted_vacated_remanded"), ["25-133"]);
});

console.log("Order list, November 10, 2025, and miscellaneous orders");
check("Nov 10: one grant, 184 denials", () => {
  const nov10 = parseOrderText(read("111025zor_bqmc.txt"));
  assert.deepEqual(of(nov10.actions, "petition_granted"), ["24-1260"]);
  assert.equal(of(nov10.actions, "petition_denied").length, 184);
});
check("Oct 10, 2025 miscellaneous order: a grant", () => {
  const r = parseOrderText(read("101025zr_l6gn.txt"));
  assert.equal(r.orderDate, "2025-10-10");
  assert.deepEqual(r.actions.map((a) => [a.docketNumber, a.action]), [["24-1063", "petition_granted"]]);
});
check("Oct 7, 2026 miscellaneous orders: a denial with a stay application; mandamus is skipped", () => {
  const r = parseOrderText(read("100726zr1_08m1.txt"));
  assert.deepEqual(r.actions.map((a) => [a.docketNumber, a.action]), [["26-5759", "petition_denied"]]);
  assert.match(r.actions[0].courtText, /The petition for a writ of certiorari is denied\. Justice Jackson would grant the application for stay of execution\.$/);
  assert.equal(parseOrderText(read("100726zr_o7jp.txt")).actions.length, 0);
});

check("Oct 8, 2026: an in-chambers order on an application records nothing", () => {
  assert.deepEqual(parseOrderText(read("100826zr_b97c.txt")), { orderDate: null, actions: [], unknownHeadings: [] });
});

console.log("Synthetic (no saved fixture has this wording yet)");
check("probable jurisdiction noted", () => {
  const r = parseOrderText(
    ["(ORDER LIST: 611 U.S.)", "", "            MONDAY, JANUARY 11, 2027", "", "            ORDERS IN PENDING CASES", "",
      "26-123      ALPHA V. BETA", "", "              Probable jurisdiction noted.", ""].join("\n"),
  );
  assert.deepEqual(r.actions.map((a) => [a.docketNumber, a.action, a.actionDate]), [["26-123", "probable_jurisdiction_noted", "2027-01-11"]]);
});

console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
