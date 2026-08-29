/**
 * test-opinion-classification.ts
 *
 * Regression test for the Trump v. Barbara (25-365) opinion-classification
 * bug: Alito's dissent was shown as a "Concurring opinion" and Gorsuch (who
 * joined Thomas's dissent) rendered with a majority-side green ring.
 *
 * Covers both halves of the pipeline:
 *   1. parseOpinionAuthors() — the syllabus-text parser (scripts/fetch-opinion-authors.ts)
 *   2. computeDecisionSides() — the ring-color/side logic (src/lib/decisionSides.ts)
 *
 * Run:  npx tsx scripts/test-opinion-classification.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parseOpinionAuthors } from "./fetch-opinion-authors.js";
import { computeDecisionSides } from "../src/lib/decisionSides.js";
import type { CaseSummary } from "../src/types/index.js";

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

// ── 1. Parser: a synthetic syllabus in Trump v. Barbara's known-correct shape ──
//
// Majority: Roberts, joined by Sotomayor, Kagan, Barrett, Jackson
// Concurrence: Jackson, joined by Sotomayor (Introduction and Part I)
// Concur/dissent: Kavanaugh
// Dissent: Thomas, joined by Gorsuch
// Dissent (separate): Alito
// Dissent (separate): Gorsuch
const SYLLABUS = `
ROBERTS, C. J., delivered the opinion of the Court, in which SOTOMAYOR,
KAGAN, BARRETT, and JACKSON, JJ., joined. JACKSON, J., filed an opinion
concurring in the judgment, in which SOTOMAYOR, J., joined as to the
Introduction and Part I. KAVANAUGH, J., filed an opinion concurring in
the judgment in part and dissenting in part. THOMAS, J., filed a
dissenting opinion, in which GORSUCH, J., joined. ALITO and GORSUCH,
JJ., filed dissenting opinions.
`;

console.log("parseOpinionAuthors()");
const parsed = parseOpinionAuthors(SYLLABUS);

check("majority author is roberts", () => {
  assert.equal(parsed.majorityAuthor, "roberts");
});
check("majority joined by sotomayor, kagan, barrett, jackson", () => {
  assert.deepEqual(new Set(parsed.majorityJoinedBy), new Set(["sotomayor", "kagan", "barrett", "jackson"]));
});
check("concurrence author is jackson only (not alito, not kavanaugh)", () => {
  assert.deepEqual(parsed.concurrenceAuthors, ["jackson"]);
});
check("jackson's concurrence was joined by sotomayor", () => {
  const jackson = parsed.concurrences.find((c) => c.author === "jackson");
  assert.ok(jackson);
  assert.deepEqual(jackson!.joinedBy, ["sotomayor"]);
});
check("concur/dissent author is kavanaugh (not lumped into concurrenceAuthors)", () => {
  assert.deepEqual(parsed.concurDissentAuthors, ["kavanaugh"]);
});
check("dissent authors are exactly thomas, alito, gorsuch (three entries, per Wikipedia's table)", () => {
  assert.deepEqual(new Set(parsed.dissentAuthors), new Set(["thomas", "alito", "gorsuch"]));
  assert.equal(parsed.dissentAuthors.length, 3);
});
check("thomas's dissent was joined by gorsuch", () => {
  const thomas = parsed.dissents.find((d) => d.author === "thomas");
  assert.ok(thomas);
  assert.deepEqual(thomas!.joinedBy, ["gorsuch"]);
});
check("alito's dissent is separate (no joiners)", () => {
  const alito = parsed.dissents.find((d) => d.author === "alito");
  assert.ok(alito);
  assert.deepEqual(alito!.joinedBy, []);
});
check("gorsuch also has his OWN separate dissent entry, distinct from joining thomas", () => {
  const gorsuch = parsed.dissents.find((d) => d.author === "gorsuch");
  assert.ok(gorsuch, "gorsuch must appear as his own dissent author, not just inside thomas's joinedBy");
  assert.deepEqual(gorsuch!.joinedBy, []);
});

// ── 2. Ring color / side placement, using the case's actual committed data ──

console.log("\ncomputeDecisionSides()");
const CASE_PATH = path.join(process.cwd(), "data/cases/25-365-trump-v-barbara.json");
const caseData = JSON.parse(fs.readFileSync(CASE_PATH, "utf-8")) as CaseSummary;
const sides = computeDecisionSides(caseData);

function findEntry(key: string) {
  return [...sides.winningSide, ...sides.concurDissentSide, ...sides.losingSide].find((e) => e.key === key);
}

check("alito renders on the LOSING (dissent) side with a rose ring, not a Concurring label", () => {
  const alito = findEntry("alito");
  assert.ok(alito, "alito must appear somewhere in the rendered sides");
  assert.equal(alito!.side, "dissent");
  assert.equal(alito!.ringColor, "ring-rose-500");
  assert.equal(alito!.roleLabel, "Dissenting opinion");
});
check("gorsuch renders on the LOSING (dissent) side with a rose ring, not the default majority green", () => {
  const gorsuch = findEntry("gorsuch");
  assert.ok(gorsuch, "gorsuch must appear somewhere in the rendered sides — not silently dropped");
  assert.equal(gorsuch!.side, "dissent");
  assert.equal(gorsuch!.ringColor, "ring-rose-500");
  assert.notEqual(gorsuch!.ringColor, "ring-emerald-500");
});
check("kavanaugh renders as concur/dissent with an amber ring, distinct from pure dissent and pure majority", () => {
  const kavanaugh = findEntry("kavanaugh");
  assert.ok(kavanaugh);
  assert.equal(kavanaugh!.side, "concur-dissent");
  assert.equal(kavanaugh!.ringColor, "ring-amber-500");
});
check("roberts (majority author) and jackson (majority joiner + concurrence author) render on the winning side", () => {
  const roberts = findEntry("roberts");
  const jackson = findEntry("jackson");
  assert.ok(roberts && sides.winningSide.some((e) => e.key === "roberts"));
  assert.ok(jackson && sides.winningSide.some((e) => e.key === "jackson"));
  assert.equal(roberts!.ringColor, "ring-emerald-500");
  assert.equal(jackson!.ringColor, "ring-emerald-500");
});
check("thomas renders on the losing side", () => {
  const thomas = findEntry("thomas");
  assert.ok(thomas);
  assert.equal(thomas!.side, "dissent");
});
check("every one of the 9 justices is placed exactly once", () => {
  const all = [...sides.winningSide, ...sides.concurDissentSide, ...sides.losingSide];
  assert.equal(all.length, 9);
  assert.equal(new Set(all.map((e) => e.key)).size, 9);
});

console.log(`\n${passed} check(s) passed.`);
if (process.exitCode) {
  console.error("\nFAILED");
  process.exit(1);
}
console.log("\nAll checks passed.");
