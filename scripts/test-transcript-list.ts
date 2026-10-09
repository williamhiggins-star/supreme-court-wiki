/**
 * test-transcript-list.ts
 *
 * Regression test for transcript discovery: the pipeline fetched the plural
 * /argument_transcripts/{term} path (a 404) and only matched absolute,
 * double-quoted hrefs, so it found zero transcripts every night. Runs the
 * parser against saved copies of the Court's real listing pages.
 *
 * Run:  npx tsx scripts/test-transcript-list.ts
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parseTranscriptList, transcriptListUrl } from "./lib/argument-transcripts.js";

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

const fixture = (term: string) =>
  fs.readFileSync(path.join(process.cwd(), "scripts", "fixtures", `argument-transcript-${term}.html`), "utf-8");

console.log("Transcript listing parser");

check("listing URL is the singular /argument_transcript/{term} page", () => {
  assert.equal(
    transcriptListUrl("2026"),
    "https://www.supremecourt.gov/oral_arguments/argument_transcript/2026"
  );
});

check("OT2026 page (saved 2026-10-08): the four cases argued Oct 5-7", () => {
  const entries = parseTranscriptList(fixture("2026"), transcriptListUrl("2026"));
  assert.deepEqual(
    entries.map((e) => e.caseNumber).sort(),
    ["25-170", "25-498", "25-579", "25-735"]
  );
});

check("relative single-quoted href resolves to an absolute PDF URL", () => {
  const entries = parseTranscriptList(fixture("2026"), transcriptListUrl("2026"));
  const suncor = entries.find((e) => e.caseNumber === "25-170");
  assert.equal(
    suncor?.transcriptUrl,
    "https://www.supremecourt.gov/oral_arguments/argument_transcripts/2026/25-170_8m58.pdf"
  );
});

check("OT2025 page (saved 2026-10-08): 58 transcripts, one per docket", () => {
  const entries = parseTranscriptList(fixture("2025"), transcriptListUrl("2025"));
  assert.equal(entries.length, 58);
  assert.equal(new Set(entries.map((e) => e.caseNumber)).size, 58);
  for (const e of entries) {
    assert.match(e.caseNumber, /^\d{2}(-\d{1,5}|A\d+)$/);
    assert.match(e.transcriptUrl, /^https:\/\/www\.supremecourt\.gov\/oral_arguments\/argument_transcripts\/2025\/\d{2}(-\d+|a\d+)_[a-z0-9]+\.pdf$/);
  }
});

check("an argued application is reported in the Court's form (25A312)", () => {
  const entries = parseTranscriptList(fixture("2025"), transcriptListUrl("2025"));
  assert.ok(entries.some((e) => e.caseNumber === "25A312"));
});

check("absolute double-quoted hrefs (the old markup) still parse", () => {
  const html = `<a href="/oral_arguments/argument_transcripts/2024/23-411_6j37.pdf">23-411</a>`;
  assert.deepEqual(parseTranscriptList(html, transcriptListUrl("2024")), [
    { caseNumber: "23-411", transcriptUrl: "https://www.supremecourt.gov/oral_arguments/argument_transcripts/2024/23-411_6j37.pdf" },
  ]);
});

check("a page with no transcript links yields nothing", () => {
  assert.deepEqual(parseTranscriptList("<html><body>No transcripts</body></html>", transcriptListUrl("2027")), []);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
