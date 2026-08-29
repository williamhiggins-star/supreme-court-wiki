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
check("kavanaugh's concur/dissent has NO joiners — must not inherit thomas's trailing 'joined by gorsuch'", () => {
  // Regression: joinersAfter's forward scan wasn't bounded to the current
  // sentence, so a solo opinion immediately followed by a joined one could
  // steal the NEXT sentence's joiner. Kavanaugh's sentence here has no
  // "joined" clause of its own; Thomas's very next sentence does.
  const kavanaugh = parsed.concurDissents.find((c) => c.author === "kavanaugh");
  assert.ok(kavanaugh);
  assert.deepEqual(kavanaugh!.joinedBy, []);
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

// ── 1b. Parser must ignore citation parentheticals in the OPINION BODY ──
//
// Regression found via real-world testing against Trump v. Barbara's actual
// 194-page slip opinion: real opinions cite OTHER cases using the exact
// same "(NAME, J., concurring)" / "(NAME, J., dissenting)" Bluebook
// parenthetical format used for THIS case's own syllabus designations.
// E.g. the real opinion cites United States v. Vaello Madero as
// "(THOMAS, J., concurring)" and Arizona v. United States as "(ALITO, J.,
// concurring in part and dissenting in part)" — neither justice wrote
// anything of the kind in the case actually being parsed. Scanning the
// full document (as this function used to) let those citations inject
// phantom authors; the fix scopes the scan to the syllabus only, bounded
// by the "NOTICE: This opinion is subject to formal revision" boilerplate
// that always marks where the syllabus ends and the opinion body begins.
const DOCUMENT_WITH_BODY_NOISE = `
${SYLLABUS}
NOTICE: This opinion is subject to formal revision before publication.
Opinion of the Court.
As we explained in a similar context, see United States v. Vaello
Madero, 596 U. S. 159, 174 (2022) (THOMAS, J., concurring); see also
Arizona v. United States, 567 U. S. 387, 440-441 (2012) (ALITO, J.,
concurring in part and dissenting in part), the same principle applies
here. SOTOMAYOR, J., dissenting in a wholly unrelated later passage
should also never leak in.
`;

console.log("\nparseOpinionAuthors() — with realistic body-text citation noise past the syllabus");
const parsedWithNoise = parseOpinionAuthors(DOCUMENT_WITH_BODY_NOISE);

check("citation parentheticals in the body do NOT inject thomas/alito/sotomayor into concurrenceAuthors", () => {
  assert.deepEqual(parsedWithNoise.concurrenceAuthors, ["jackson"]);
});
check("citation parentheticals in the body do NOT inject thomas/sotomayor into dissentAuthors", () => {
  assert.deepEqual(new Set(parsedWithNoise.dissentAuthors), new Set(["thomas", "alito", "gorsuch"]));
});

// ── 1c. Multiple "in which ... joined" clauses on ONE opinion, plus a
// PDF line-wrap hyphenation artifact ("opin-\nion") — regression found via
// FS Credit Opportunities Corp. v. Saba Capital Master Fund (24-345):
// "JACKSON, J., filed a dissenting opin-\nion, in which SOTOMAYOR, J.,
// joined, and in which KAGAN, J., joined as to Parts I and II." Kagan also
// filed her OWN separate dissent — she must show up BOTH as her own
// dissent author AND as a partial joiner of Jackson's, and the hyphenated
// "opin-\nion" must not make Jackson's whole dissent invisible.
const MULTI_JOIN_DOCUMENT = `
BARRETT, J., delivered the opinion of the Court, in which ROBERTS, C. J.,
and THOMAS, ALITO, GORSUCH, and KAVANAUGH, JJ., joined. KAGAN, J., filed
a dissenting opinion. JACKSON, J., filed a dissenting opin-
ion, in which SOTOMAYOR, J., joined, and in which KAGAN, J., joined as
to Parts I and II.
`;

console.log("\nparseOpinionAuthors() — multiple join clauses on one opinion + line-wrap hyphenation");
const parsedMultiJoin = parseOpinionAuthors(MULTI_JOIN_DOCUMENT);

check("line-wrap hyphenated 'dissenting opin-\\nion' is still recognized (jackson isn't dropped entirely)", () => {
  assert.ok(parsedMultiJoin.dissentAuthors.includes("jackson"), "jackson must appear as a dissent author despite the hyphen break");
});
check("kagan appears as her OWN solo dissent author", () => {
  const kagan = parsedMultiJoin.dissents.find((d) => d.author === "kagan");
  assert.ok(kagan);
  assert.deepEqual(kagan!.joinedBy, []);
});
check("jackson's dissent was joined by BOTH sotomayor (full) and kagan (partial, Parts I and II) — second 'in which' clause isn't dropped", () => {
  const jackson = parsedMultiJoin.dissents.find((d) => d.author === "jackson");
  assert.ok(jackson);
  assert.deepEqual(new Set(jackson!.joinedBy), new Set(["sotomayor", "kagan"]));
});
check("every one of the 9 justices is accounted for (majority side 6 + kagan + jackson + sotomayor = 9)", () => {
  const everyone = new Set([
    parsedMultiJoin.majorityAuthor,
    ...parsedMultiJoin.majorityJoinedBy,
    ...parsedMultiJoin.dissentAuthors,
    ...parsedMultiJoin.dissents.flatMap((d) => d.joinedBy),
  ]);
  assert.equal(everyone.size, 9);
});
check("classification is identical with or without the body noise", () => {
  assert.deepEqual(parsedWithNoise.majorityAuthor, parsed.majorityAuthor);
  assert.deepEqual(parsedWithNoise.concurDissentAuthors, parsed.concurDissentAuthors);
});

// ── 1d. Unanimous decisions: "delivered the opinion for a unanimous Court" ──
//
// Regression found via real-world testing: roughly a third of the 2025-term
// backfill's decided cases are unanimous, and SCOTUS syllabi announce that
// with "delivered the opinion for a unanimous Court" rather than an
// enumerated "in which X, Y, and Z, JJ., joined" clause — so
// majorityJoinedBy silently came back empty for every one of them.
const UNANIMOUS_DOCUMENT = `
JACKSON, J., delivered the opinion for a unanimous Court.
`;
const parsedUnanimous = parseOpinionAuthors(UNANIMOUS_DOCUMENT);
check("unanimous phrasing populates majorityJoinedBy with all 8 other justices", () => {
  assert.equal(parsedUnanimous.majorityAuthor, "jackson");
  assert.deepEqual(
    new Set(parsedUnanimous.majorityJoinedBy),
    new Set(["roberts", "thomas", "alito", "sotomayor", "kagan", "gorsuch", "kavanaugh", "barrett"])
  );
});

// ── 1e. PDF page-break furniture spliced mid-sentence ──────────────────────
//
// Regression found via Trump v. Cook (25A312): whenever a designator/verb
// phrase happens to straddle a page boundary, the extractor splices in
// "\n\n-- N of M --\n\n<page#> <CASE NAME>\n<running head>\n" right in the
// middle of it, breaking word-adjacency — "THOMAS, J., filed a" ends up on
// one page and "dissenting opinion." on the next, so the verb pattern
// never matches and Thomas silently vanishes from dissentAuthors entirely.
const PAGE_BREAK_DOCUMENT =
  "ROBERTS, C. J., delivered the opinion of the Court, in which SOTOMAYOR, " +
  "KAGAN, KAVANAUGH, and JACKSON, JJ., joined. KAVANAUGH and JACKSON, JJ., " +
  "filed concurring opinions. THOMAS, J., filed a\n\n" +
  "-- 5 of 83 --\n\n" +
  "6 \tTRUMP v. COOK\nSyllabus\n" +
  "dissenting opinion. ALITO, J., filed a dissenting opinion, in which\n" +
  "GORSUCH, J., joined. BARRETT, J., filed a dissenting opinion.\n";

const parsedPageBreak = parseOpinionAuthors(PAGE_BREAK_DOCUMENT);
check("a designator/verb phrase split across a page break is still recognized (thomas isn't dropped)", () => {
  assert.ok(
    parsedPageBreak.dissentAuthors.includes("thomas"),
    `thomas must appear as a dissent author despite the page-break splice; got [${parsedPageBreak.dissentAuthors}]`
  );
});
check("the other dissenters on either side of the break are unaffected", () => {
  assert.deepEqual(new Set(parsedPageBreak.dissentAuthors), new Set(["thomas", "alito", "barrett"]));
});

// ── 1f. A justice who authors ONE opinion and separately JOINS another ──
//
// Regression found via Cisco Systems v. Doe I (24-856), cross-checked
// against SCOTUSblog's 2025-26 Term Final Stat Pack: "JACKSON, J., filed
// an opinion concurring in part and dissenting in part, in which KAGAN,
// J., joined. SOTOMAYOR, J., filed a dissenting opinion, in which KAGAN
// and JACKSON, JJ., joined as to Parts I–III and V." Jackson is BOTH the
// concur/dissent's author AND a joiner of Sotomayor's separate dissent.
// The exclude-set that keeps a concur/dissent author from being
// misclassified as a plain dissent AUTHOR was also, wrongly, stripping
// them from other opinions' joinedBy lists.
const MULTI_OPINION_PARTICIPANT_DOCUMENT = `
BARRETT, J., delivered the opinion of the Court, in which ROBERTS, C. J.,
and THOMAS, ALITO, GORSUCH, and KAVANAUGH, JJ., joined. JACKSON, J.,
filed an opinion concurring in part and dissenting in part, in which
KAGAN, J., joined. SOTOMAYOR, J., filed a dissenting opinion, in which
KAGAN and JACKSON, JJ., joined as to Parts I–III and V.
`;
const parsedMultiParticipant = parseOpinionAuthors(MULTI_OPINION_PARTICIPANT_DOCUMENT);
check("jackson is the concur/dissent author, joined by kagan", () => {
  const jackson = parsedMultiParticipant.concurDissents.find((c) => c.author === "jackson");
  assert.ok(jackson);
  assert.deepEqual(jackson!.joinedBy, ["kagan"]);
});
check("sotomayor's SEPARATE dissent is joined by BOTH kagan and jackson — jackson isn't dropped just because she already authored the concur/dissent", () => {
  const sotomayor = parsedMultiParticipant.dissents.find((d) => d.author === "sotomayor");
  assert.ok(sotomayor);
  assert.deepEqual(new Set(sotomayor!.joinedBy), new Set(["kagan", "jackson"]));
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

// ── 3. Plurality: a majority opinion split by parts (full majority on some,
// a narrower coalition on others) — modeled on Barrett v. United States
// (24-5774): Jackson delivers the Court's opinion for Parts I-IV-B (joined
// by all 8 others) and a separate opinion for Part IV-C joined only by
// Roberts, Sotomayor, and Kagan — not enough for a majority on that part.
console.log("\ncomputeDecisionSides() — plurality");
const pluralityCase: CaseSummary = {
  ...caseData,
  majorityAuthor: "jackson",
  majorityJoinedBy: ["roberts", "thomas", "alito", "sotomayor", "kagan", "gorsuch", "kavanaugh", "barrett"],
  pluralityAuthor: "jackson",
  pluralityJoinedBy: ["roberts", "sotomayor", "kagan"],
  concurrenceAuthors: ["gorsuch"],
  concurDissentAuthors: undefined,
  dissentAuthors: undefined,
  concurringSummaries: undefined,
  concurDissentSummaries: undefined,
  dissentSummaries: undefined,
};
const pluralitySides = computeDecisionSides(pluralityCase);
function findPluralityEntry(key: string) {
  return [...pluralitySides.winningSide, ...pluralitySides.concurDissentSide, ...pluralitySides.losingSide].find((e) => e.key === key);
}
check("jackson (majority AND plurality author) shows as plain 'Majority opinion' — authoring the majority is the more senior status", () => {
  const jackson = findPluralityEntry("jackson");
  assert.ok(jackson);
  assert.equal(jackson!.side, "majority");
  assert.equal(jackson!.roleLabel, "Majority opinion");
  assert.equal(jackson!.ringColor, "ring-emerald-500");
});
check("roberts, sotomayor, and kagan (plurality joiners, nothing more specific) get the teal plurality ring, not plain green", () => {
  for (const key of ["roberts", "sotomayor", "kagan"]) {
    const entry = findPluralityEntry(key);
    assert.ok(entry, `${key} must appear`);
    assert.equal(entry!.side, "plurality", `${key} side`);
    assert.equal(entry!.ringColor, "ring-teal-500", `${key} ring`);
    assert.equal(entry!.roleLabel, "Joined plurality opinion", `${key} label`);
  }
});
check("gorsuch's own concurrence takes priority over plurality — he's not a plurality joiner here anyway", () => {
  const gorsuch = findPluralityEntry("gorsuch");
  assert.ok(gorsuch);
  assert.equal(gorsuch!.side, "majority");
  assert.equal(gorsuch!.roleLabel, "Concurring opinion");
});
check("thomas, alito, kavanaugh, barrett — majority joiners only, not plurality joiners — stay plain silent green", () => {
  for (const key of ["thomas", "alito", "kavanaugh", "barrett"]) {
    const entry = findPluralityEntry(key);
    assert.ok(entry, `${key} must appear`);
    assert.equal(entry!.side, "majority", `${key} side`);
    assert.equal(entry!.ringColor, "ring-emerald-500", `${key} ring`);
    assert.equal(entry!.roleLabel, null, `${key} label`);
  }
});
check("every one of the 9 justices is placed exactly once in the plurality case too", () => {
  const all = [...pluralitySides.winningSide, ...pluralitySides.concurDissentSide, ...pluralitySides.losingSide];
  assert.equal(all.length, 9);
  assert.equal(new Set(all.map((e) => e.key)).size, 9);
});

// ── 4. Joiner vs. author labels for concurrence, concur/dissent, and
// dissent — the same distinction plurality already had (an author earns
// "X opinion", a joiner-only earns "Joined X opinion"), extended to the
// other three categories. Before this fix, concurrenceSet/concurDissentSet
// /dissentSet each conflated authors and joiners into one flat Set, so a
// justice who only JOINED an opinion got labeled identically to the
// justice who WROTE it — confirmed on 18 of 60 decided cases for
// concurrence alone (e.g. Learning Resources v. Trump's Sotomayor: fully
// joins the majority, then only partially joins Kagan's concurrence —
// was showing "Concurring opinion" as if she'd authored something), 2 for
// concur/dissent, and 23 for dissent. This is a label-only fix: side and
// ring color are unchanged (concur/dissent and dissent membership already
// took priority over plain majority membership for ring purposes before
// this fix).
console.log("\ncomputeDecisionSides() — joiner vs. author labels (concurrence, concur/dissent, dissent)");
const joinerCase: CaseSummary = {
  ...caseData,
  majorityAuthor: "roberts",
  majorityJoinedBy: ["thomas", "sotomayor", "gorsuch", "jackson"],
  pluralityAuthor: undefined,
  pluralityJoinedBy: undefined,
  concurrenceAuthors: ["kagan"],
  concurringSummaries: [{ author: "kagan", summary: "x", joinedBy: ["sotomayor"] }],
  concurDissentAuthors: ["barrett"],
  concurDissentSummaries: [{ author: "barrett", summary: "x", joinedBy: ["thomas"] }],
  dissentAuthors: ["kavanaugh"],
  dissentSummaries: [{ author: "kavanaugh", summary: "x", joinedBy: ["alito"] }],
};
const joinerSides = computeDecisionSides(joinerCase);
function findJoinerEntry(key: string) {
  return [...joinerSides.winningSide, ...joinerSides.concurDissentSide, ...joinerSides.losingSide].find((e) => e.key === key);
}
check("kagan (concurrence AUTHOR) keeps the plain 'Concurring opinion' label", () => {
  const kagan = findJoinerEntry("kagan");
  assert.ok(kagan);
  assert.equal(kagan!.roleLabel, "Concurring opinion");
  assert.equal(kagan!.ringColor, "ring-emerald-500");
});
check("sotomayor (full majority joiner who ONLY joins kagan's concurrence, never authors one) gets 'Joined concurring opinion', not 'Concurring opinion'", () => {
  const sotomayor = findJoinerEntry("sotomayor");
  assert.ok(sotomayor);
  assert.equal(sotomayor!.roleLabel, "Joined concurring opinion");
  assert.equal(sotomayor!.ringColor, "ring-emerald-500", "ring must stay emerald — this is a label-only fix");
  assert.equal(sotomayor!.side, "majority");
});
check("barrett (concur/dissent AUTHOR) keeps the plain 'Concurring in part, dissenting in part' label", () => {
  const barrett = findJoinerEntry("barrett");
  assert.ok(barrett);
  assert.equal(barrett!.roleLabel, "Concurring in part, dissenting in part");
  assert.equal(barrett!.ringColor, "ring-amber-500");
});
check("thomas (full majority joiner who ONLY joins barrett's concur/dissent) gets 'Joined concurring/dissenting opinion'", () => {
  const thomas = findJoinerEntry("thomas");
  assert.ok(thomas);
  assert.equal(thomas!.roleLabel, "Joined concurring/dissenting opinion");
  assert.equal(thomas!.side, "concur-dissent");
  assert.equal(thomas!.ringColor, "ring-amber-500", "concur/dissent membership still outranks plain majority membership for SIDE/ring — only the label changed");
});
check("kavanaugh (dissent AUTHOR) keeps the plain 'Dissenting opinion' label", () => {
  const kavanaugh = findJoinerEntry("kavanaugh");
  assert.ok(kavanaugh);
  assert.equal(kavanaugh!.roleLabel, "Dissenting opinion");
  assert.equal(kavanaugh!.ringColor, "ring-rose-500");
});
check("alito (ONLY joins kavanaugh's dissent, never authors one, not a majority joiner either) gets 'Joined dissenting opinion'", () => {
  const alito = findJoinerEntry("alito");
  assert.ok(alito);
  assert.equal(alito!.roleLabel, "Joined dissenting opinion");
  assert.equal(alito!.ringColor, "ring-rose-500");
  assert.equal(alito!.side, "dissent");
});
check("gorsuch and jackson — plain majority joiners with no opinion tie at all — stay silent, unaffected by the fix", () => {
  for (const key of ["gorsuch", "jackson"]) {
    const entry = findJoinerEntry(key);
    assert.ok(entry, `${key} must appear`);
    assert.equal(entry!.roleLabel, null, `${key} label`);
    assert.equal(entry!.ringColor, "ring-emerald-500", `${key} ring`);
  }
});
check("every one of the 9 justices is placed exactly once in the joiner-label case too", () => {
  const all = [...joinerSides.winningSide, ...joinerSides.concurDissentSide, ...joinerSides.losingSide];
  assert.equal(all.length, 9);
  assert.equal(new Set(all.map((e) => e.key)).size, 9);
});

console.log(`\n${passed} check(s) passed.`);
if (process.exitCode) {
  console.error("\nFAILED");
  process.exit(1);
}
console.log("\nAll checks passed.");
