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
  DATA_DIR,
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
// Step 1b — Promote argued cases (upcoming → petition)
// ---------------------------------------------------------------------------

/**
 * For any "upcoming" case whose argumentDate is in the past, flip
 * docketStatus to "petition" so it appears in the Argued column.
 * This runs every day and requires no API calls.
 */
function promoteArguedCases(existingSlugs: Set<string>): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let promoted = 0;

  for (const slug of existingSlugs) {
    const filePath = path.join(CASES_DIR, `${slug}.json`);
    let caseData: CaseSummary;
    try {
      caseData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CaseSummary;
    } catch {
      continue;
    }

    if (caseData.docketStatus !== "upcoming") continue;
    if (!caseData.argumentDate) continue;

    const [y, m, d] = caseData.argumentDate.split("-").map(Number);
    const argDate = new Date(y, m - 1, d);
    if (argDate >= today) continue;

    caseData.docketStatus = "petition";
    fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
    console.log(`  ✓ promoted to argued: ${caseData.title} (argued ${caseData.argumentDate})`);
    promoted++;
  }

  return promoted;
}

// ---------------------------------------------------------------------------
// Step 2 — Process new transcripts
// ---------------------------------------------------------------------------

function isUpcomingCase(slug: string): boolean {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(CASES_DIR, `${slug}.json`), "utf-8")
    ) as CaseSummary;
    return data.docketStatus === "upcoming";
  } catch {
    return false;
  }
}

async function processNewTranscripts(
  client: Anthropic,
  transcripts: TranscriptEntry[],
  existingSlugs: Set<string>,
  termYear: string
): Promise<number> {
  let processed = 0;

  for (const { caseNumber, transcriptUrl } of transcripts) {
    const existing = existingSlugForCaseNumber(caseNumber, existingSlugs);
    if (existing && !isUpcomingCase(existing)) {
      console.log(`  Skipping ${caseNumber} (already processed as ${existing})`);
      continue;
    }
    if (existing) {
      console.log(`\nTranscript now available for upcoming case: ${caseNumber} — upgrading to argued`);
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

      // If this case was previously "upcoming", remove the old stub file
      // (slug may differ if the title was slightly different in the docket page)
      const oldSlug = existingSlugForCaseNumber(caseNumber, existingSlugs);
      if (oldSlug && oldSlug !== result.case.slug) {
        const oldFile = path.join(CASES_DIR, `${oldSlug}.json`);
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
          console.log(`  Removed old upcoming stub: ${oldSlug}.json`);
        }
        existingSlugs.delete(oldSlug);
      }

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
  const url = `${SCOTUS_BASE}/oral_arguments/argument_calendars.aspx`;
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

const SCOTUS_DOCKET_BASE =
  "https://www.supremecourt.gov/docket/docketfiles/html/public";

async function fetchDocketPage(caseNumber: string): Promise<string> {
  const url = `${SCOTUS_DOCKET_BASE}/${caseNumber}.html`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Docket fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 20_000);
}

const UPCOMING_SYSTEM = `You are a legal expert who makes US Supreme Court cases accessible to non-lawyers.
You have been given docket information about a case accepted for oral argument but not yet argued.
Generate a structured case summary based on the available information from petitions and briefs.
You always respond with valid JSON matching the exact schema provided. Do not include any text outside the JSON object.`;

function buildUpcomingPrompt(
  caseNumber: string,
  argumentDate: string,
  termYear: string,
  docketText: string
): string {
  return `Analyze this upcoming Supreme Court case and return a JSON object with EXACTLY this structure.
Leave keyExchanges as an empty array for all parties.

{
  "title": "Short case name, e.g. 'Smith v. Jones'",
  "argumentDate": "${argumentDate}",
  "legalQuestion": "One sentence: the core legal question before the Court",
  "backgroundAndFacts": "2-3 paragraphs in plain English for a non-lawyer",
  "significance": "1-2 paragraphs: why this case matters",
  "parties": [
    {
      "party": "Party name",
      "role": "petitioner | respondent | amicus",
      "coreArgument": "2-3 sentences summarizing their written position",
      "supportingPoints": ["Up to 4 key points from their briefs"],
      "keyExchanges": []
    }
  ],
  "citedPrecedents": [
    {
      "caseName": "Full case name",
      "citation": "e.g. '410 U.S. 113'",
      "year": 1973,
      "reasonCited": "1-2 sentences: why it is relevant",
      "citedBy": "petitioner | respondent | court | multiple",
      "summary": "1-2 sentences: what this earlier case decided"
    }
  ],
  "legalTerms": [
    {
      "term": "The legal term",
      "definition": "Plain-English definition (2-3 sentences)",
      "examples": ["One example from this case"],
      "relatedTerms": ["1-2 related terms"]
    }
  ]
}

Rules:
- keyExchanges MUST be [] for every party
- Include at most 2 parties (petitioner and respondent)
- Include at most 6 citedPrecedents
- Include at most 8 legalTerms
- Return only the JSON object, no other text

Case number: ${caseNumber}
Scheduled argument: ${argumentDate} at 10:00 a.m. ET
Term year: ${termYear}

DOCKET INFORMATION:
${docketText}`;
}

async function processUpcomingCases(
  client: Anthropic,
  upcoming: UpcomingCase[],
  existingSlugs: Set<string>
): Promise<number> {
  let added = 0;

  for (const { caseNumber, argumentDate, termYear } of upcoming) {
    const existing = existingSlugForCaseNumber(caseNumber, existingSlugs);
    if (existing) continue; // already in data

    console.log(`\nProcessing new upcoming case: ${caseNumber} (${argumentDate})`);

    try {
      const docketText = await fetchDocketPage(caseNumber);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await withRetry(() =>
        client.messages.create({
          model: process.env.MODEL ?? "claude-sonnet-4-6",
          max_tokens: 6000,
          system: UPCOMING_SYSTEM,
          messages: [
            {
              role: "user",
              content: buildUpcomingPrompt(caseNumber, argumentDate, termYear, docketText),
            },
          ],
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlock = response.content.find((b: any) => b.type === "text");
      if (!textBlock) throw new Error("No text in response");

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");

      const raw = JSON.parse(jsonMatch[0]);
      const docketUrl = `${SCOTUS_DOCKET_BASE}/${caseNumber}.html`;
      const result = buildResult(raw, caseNumber, termYear, docketUrl, "upcoming");
      saveResult(result, console.log);

      existingSlugs.add(result.case.slug);
      added++;
    } catch (err) {
      console.error(`  Error processing upcoming case ${caseNumber}: ${err}`);
    }
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
// Step 5 — Update conference calendar from case distribution schedule PDF
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

async function updateCalendar(termYear: string): Promise<void> {
  const url = `${SCOTUS_BASE}/casedistribution/casedistributionschedule${termYear}.pdf`;
  console.log(`\nUpdating conference calendar from: ${url}`);

  try {
    const pdfBuffer = await downloadPdf(url);
    const text = await extractText(pdfBuffer);

    const dateRe =
      /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2}),\s+(\d{4})\b/gi;
    const conferences = new Set<string>();

    for (const line of text.split(/\r?\n/)) {
      const matches = [...line.matchAll(dateRe)];
      if (matches.length < 2) continue;
      // Last date on line = conference date
      const last = matches[matches.length - 1];
      const m = MONTH_MAP[last[1].toUpperCase()];
      const d = parseInt(last[2]);
      const y = parseInt(last[3]);
      if (!m) continue;
      conferences.add(
        `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      );
    }

    if (conferences.size === 0) {
      console.warn("  No conference dates parsed — skipping calendar update");
      return;
    }

    const calendarPath = path.join(DATA_DIR, "calendar.json");
    const calendarData = {
      term: termYear,
      generated: new Date().toISOString().split("T")[0],
      conferences: [...conferences].sort(),
    };
    fs.writeFileSync(calendarPath, JSON.stringify(calendarData, null, 2));
    console.log(`  ✓ calendar.json updated: ${conferences.size} conference dates`);
  } catch (err) {
    console.warn(`  Could not update calendar: ${err}`);
    // Non-fatal — existing calendar.json continues to work
  }
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
  const termYear = process.env.TERM_YEAR || currentTermYear();
  console.log(`\n=== Supreme Court daily update — term ${termYear} ===`);
  console.log(`Started at: ${new Date().toISOString()}`);

  const existingSlugs = getExistingCaseSlugs();
  console.log(`Existing cases in data/: ${existingSlugs.size}`);

  // Step 1b: Promote argued cases (upcoming → petition, no API needed)
  console.log("\nPromoting argued cases...");
  const promoted = promoteArguedCases(existingSlugs);

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
  const newUpcoming = await processUpcomingCases(client, upcoming, existingSlugs);

  // Step 4: Slip opinions
  const opinions = await fetchSlipOpinions(termYear);
  const decisionsUpdated = updateDecidedCases(opinions, existingSlugs);

  // Step 5: Conference calendar
  await updateCalendar(termYear);

  console.log("\n=== Summary ===");
  console.log(`  Cases promoted to argued  : ${promoted}`);
  console.log(`  New transcripts processed : ${newTranscripts}`);
  console.log(`  Upcoming cases added      : ${newUpcoming}`);
  console.log(`  Decisions updated         : ${decisionsUpdated}`);
  console.log(`  Total changes             : ${promoted + newTranscripts + newUpcoming + decisionsUpdated}`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
