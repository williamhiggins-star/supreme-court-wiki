#!/usr/bin/env tsx
/**
 * update-cases.ts
 *
 * Automated daily pipeline run by GitHub Actions.
 * Scrapes the Supreme Court website for:
 *   1. New oral argument transcripts (→ docketStatus: "petition")
 *   2. Upcoming argument schedule (→ docketStatus: "upcoming")
 *   3. New slip opinions / decisions (→ docketStatus: "decided")
 *
 * Writes new/updated JSON files to data/ which GitHub Actions then commits.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import {
  downloadPdf,
  extractText,
  generateSummary,
  buildResult,
  saveResult,
  ensureDataDirs,
  withRetry,
  getExistingCaseSlugs,
  existingSlugForCaseNumber,
  toSlug,
  CASES_DIR,
} from "./pipeline.js";
import type { CaseSummary } from "../src/types/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCOTUS_BASE = "https://www.supremecourt.gov";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SupremeCourtWiki/1.0; +https://github.com/supreme-court-wiki)";

function currentTermYear(): string {
  const now = new Date();
  // SCOTUS term starts in October; before October, term year = previous year
  return now.getMonth() >= 9
    ? String(now.getFullYear())
    : String(now.getFullYear() - 1);
}

function shortTermYear(termYear: string): string {
  // "2024" → "24"
  return termYear.slice(2);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Step 1 — Fetch transcript list
// ---------------------------------------------------------------------------

interface TranscriptEntry {
  caseNumber: string;
  transcriptUrl: string;
}

async function fetchTranscriptList(termYear: string): Promise<TranscriptEntry[]> {
  const url = `${SCOTUS_BASE}/oral_arguments/argument_transcripts/${termYear}`;
  console.log(`\nFetching transcript list: ${url}`);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  Could not fetch transcript list: ${err}`);
    return [];
  }

  // Match links to PDF transcripts, e.g.:
  // href="/oral_arguments/argument_transcripts/2024/23-411_6j37.pdf"
  const pattern =
    /href="(\/oral_arguments\/argument_transcripts\/\d{4}\/([^"_/]+)[^"]*\.pdf)"/gi;
  const seen = new Set<string>();
  const results: TranscriptEntry[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const relPath = match[1];
    const caseNumber = match[2]; // e.g. "23-411"
    if (seen.has(caseNumber)) continue;
    seen.add(caseNumber);
    results.push({
      caseNumber,
      transcriptUrl: `${SCOTUS_BASE}${relPath}`,
    });
  }

  console.log(`  Found ${results.length} transcripts for ${termYear} term`);
  return results;
}

// ---------------------------------------------------------------------------
// Step 2 — Process new transcripts
// ---------------------------------------------------------------------------

async function processNewTranscripts(
  client: Anthropic,
  transcripts: TranscriptEntry[],
  existingSlugs: Set<string>,
  termYear: string
): Promise<number> {
  let processed = 0;

  for (const { caseNumber, transcriptUrl } of transcripts) {
    const existing = existingSlugForCaseNumber(caseNumber, existingSlugs);
    if (existing) {
      console.log(`  Skipping ${caseNumber} (already processed as ${existing})`);
      continue;
    }

    console.log(`\nProcessing new transcript: ${caseNumber}`);
    console.log(`  URL: ${transcriptUrl}`);

    try {
      const pdfBuffer = await downloadPdf(transcriptUrl);
      console.log(`  Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

      const text = await extractText(pdfBuffer);
      console.log(`  Extracted ${text.length.toLocaleString()} chars`);

      const raw = await withRetry(() =>
        generateSummary(client, text, caseNumber, termYear, console.log)
      );

      const result = buildResult(raw, caseNumber, termYear, transcriptUrl, "petition");
      saveResult(result, console.log);

      // Add to known slugs so we don't process it again in this run
      existingSlugs.add(result.case.slug);
      processed++;
    } catch (err) {
      console.error(`  Error processing ${caseNumber}: ${err}`);
      // Continue with next case
    }
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Step 3 — Fetch upcoming argument calendar
// ---------------------------------------------------------------------------

interface UpcomingCase {
  caseNumber: string;
  title: string;
  argumentDate: string; // YYYY-MM-DD
  termYear: string;
}

async function fetchUpcomingArguments(): Promise<UpcomingCase[]> {
  const url = `${SCOTUS_BASE}/oral_arguments/oral_arguments.html`;
  console.log(`\nFetching argument calendar: ${url}`);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  Could not fetch argument calendar: ${err}`);
    return [];
  }

  const results: UpcomingCase[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // The SCOTUS argument calendar contains table rows like:
  // <td>January 13, 2025</td>
  // followed by case numbers and names.
  // We extract date + case-number pairs.
  //
  // Pattern: find date cells then look for case numbers in nearby cells.
  const datePattern =
    /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})\b/g;
  const caseNumPattern = /\b(\d{2}-\d{3,4})\b/g;

  // Split HTML into rough "date sections" and extract case numbers from each
  const sections = html.split(datePattern);
  // sections: [pre, dateStr, content, dateStr, content, ...]

  for (let i = 1; i < sections.length; i += 2) {
    const dateStr = sections[i];
    const content = sections[i + 1] ?? "";

    // Parse date
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) continue;
    if (parsed < today) continue; // only future arguments

    const argDateISO = parsed.toISOString().split("T")[0];
    const termYear =
      parsed.getMonth() >= 9
        ? String(parsed.getFullYear())
        : String(parsed.getFullYear() - 1);

    // Extract case numbers from the next section (until the next date)
    const nextDateIdx = content.search(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/
    );
    const segment = nextDateIdx > 0 ? content.slice(0, nextDateIdx) : content;

    let match: RegExpExecArray | null;
    caseNumPattern.lastIndex = 0;
    while ((match = caseNumPattern.exec(segment)) !== null) {
      const caseNumber = match[1];
      // Extract a rough title: look for text near the case number
      const vicinity = segment.slice(
        Math.max(0, match.index - 100),
        match.index + 200
      );
      // Strip HTML tags
      const plainText = vicinity.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      // Try to extract "v." pattern
      const titleMatch = plainText.match(/([A-Z][^.]+v\.[^,\n]+)/);
      const title = titleMatch ? titleMatch[1].trim() : caseNumber;

      results.push({ caseNumber, title, argumentDate: argDateISO, termYear });
    }
  }

  // Deduplicate by caseNumber
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    if (seen.has(r.caseNumber)) return false;
    seen.add(r.caseNumber);
    return true;
  });

  console.log(`  Found ${deduped.length} upcoming arguments`);
  return deduped;
}

function addUpcomingCases(
  upcoming: UpcomingCase[],
  existingSlugs: Set<string>
): number {
  let added = 0;

  for (const { caseNumber, title, argumentDate, termYear } of upcoming) {
    const existing = existingSlugForCaseNumber(caseNumber, existingSlugs);
    if (existing) continue; // already in data

    const slug = toSlug(`${caseNumber}-${title}`);
    const caseData: CaseSummary = {
      slug,
      caseNumber,
      title,
      termYear,
      argumentDate,
      transcriptUrl: "",
      docketStatus: "upcoming",
      backgroundAndFacts: "",
      legalQuestion: "",
      significance: "",
      parties: [],
      citedPrecedents: [],
      legalTermsUsed: [],
      processedAt: new Date().toISOString(),
    };

    const filePath = path.join(CASES_DIR, `${slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
    existingSlugs.add(slug);
    console.log(`  + upcoming: ${title} (${argumentDate})`);
    added++;
  }

  return added;
}

// ---------------------------------------------------------------------------
// Step 4 — Fetch slip opinions (decided cases)
// ---------------------------------------------------------------------------

interface SlipOpinion {
  caseNumber: string;
  title: string;
  opinionUrl: string;
}

async function fetchSlipOpinions(termYear: string): Promise<SlipOpinion[]> {
  const shortYear = shortTermYear(termYear);
  const url = `${SCOTUS_BASE}/opinions/slipopinion/${shortYear}`;
  console.log(`\nFetching slip opinions: ${url}`);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`  Could not fetch slip opinions: ${err}`);
    return [];
  }

  const results: SlipOpinion[] = [];
  const seen = new Set<string>();

  // Slip opinion links look like:
  // href="/opinions/24pdf/23-411_abc.pdf" with case number nearby
  const pattern =
    /href="(\/opinions\/\d+pdf\/([^"_]+)[^"]*\.pdf)"[^>]*>([^<]+)</gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const opinionPath = match[1];
    const caseNumber = match[2];
    const rawTitle = match[3].trim();

    if (seen.has(caseNumber)) continue;
    if (!caseNumber.match(/^\d{2}-\d{3,4}$/)) continue;
    seen.add(caseNumber);

    results.push({
      caseNumber,
      title: rawTitle || caseNumber,
      opinionUrl: `${SCOTUS_BASE}${opinionPath}`,
    });
  }

  console.log(`  Found ${results.length} slip opinions`);
  return results;
}

function updateDecidedCases(
  opinions: SlipOpinion[],
  existingSlugs: Set<string>
): number {
  let updated = 0;

  for (const { caseNumber, title, opinionUrl } of opinions) {
    const existingSlug = existingSlugForCaseNumber(caseNumber, existingSlugs);
    if (!existingSlug) continue; // not in our data yet — transcript pipeline will add it

    const filePath = path.join(CASES_DIR, `${existingSlug}.json`);
    let caseData: CaseSummary;
    try {
      caseData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CaseSummary;
    } catch {
      continue;
    }

    if (caseData.docketStatus === "decided") continue; // already marked

    caseData.docketStatus = "decided";
    if (!caseData.outcome) {
      caseData.outcome = `Opinion filed. See: ${opinionUrl}`;
    }

    fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
    console.log(`  ✓ marked decided: ${caseData.title ?? title}`);
    updated++;
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  ensureDataDirs();
  const client = new Anthropic();
  const termYear = process.env.TERM_YEAR ?? currentTermYear();
  console.log(`\n=== Supreme Court daily update — term ${termYear} ===`);
  console.log(`Started at: ${new Date().toISOString()}`);

  const existingSlugs = getExistingCaseSlugs();
  console.log(`Existing cases in data/: ${existingSlugs.size}`);

  // Step 1 + 2: New transcripts
  const transcripts = await fetchTranscriptList(termYear);
  const newTranscripts = await processNewTranscripts(
    client,
    transcripts,
    existingSlugs,
    termYear
  );

  // Step 3: Upcoming arguments
  const upcoming = await fetchUpcomingArguments();
  const newUpcoming = addUpcomingCases(upcoming, existingSlugs);

  // Step 4: Slip opinions
  const opinions = await fetchSlipOpinions(termYear);
  const decisionsUpdated = updateDecidedCases(opinions, existingSlugs);

  console.log("\n=== Summary ===");
  console.log(`  New transcripts processed : ${newTranscripts}`);
  console.log(`  Upcoming cases added      : ${newUpcoming}`);
  console.log(`  Decisions updated         : ${decisionsUpdated}`);
  console.log(`  Total changes             : ${newTranscripts + newUpcoming + decisionsUpdated}`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
