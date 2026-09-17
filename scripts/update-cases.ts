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
import type { CaseSummary, ProcessingResult } from "../src/types/index.js";
import { getCredentials, type SupabaseCredentials } from "./lib/supabase-sync/env.js";
import { loadIdCache, syncCase, syncNewTerm, syncNewPrecedent, type IdCache } from "./lib/sd-db/write.js";
import { currentTermYear } from "./lib/sd-db/constants.js";

// ---------------------------------------------------------------------------
// Dual-write (Phase 3, SUPABASE_PLAN.md) — data/*.json stays the source of
// truth the site renders from; this is purely additive and never blocks
// or fails the JSON writes it follows. Cache loaded once (lazily) and
// reused across everything this run touches. data/calendar.json is
// deliberately not synced (decided: stays JSON-only).
// ---------------------------------------------------------------------------

let dbContext: { creds: SupabaseCredentials; cache: IdCache } | null | undefined;

async function getDbContext(): Promise<{ creds: SupabaseCredentials; cache: IdCache } | null> {
  if (dbContext !== undefined) return dbContext;
  const creds = getCredentials();
  if (!creds) {
    console.log("[sd-db] skipped (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    dbContext = null;
    return null;
  }
  dbContext = { creds, cache: await loadIdCache(creds) };
  return dbContext;
}

async function dualWriteCase(c: CaseSummary): Promise<void> {
  const ctx = await getDbContext();
  if (!ctx) return;
  try {
    const { warnings } = await syncCase(ctx.creds, ctx.cache, c);
    warnings.forEach((w) => console.warn(`[sd-db] ${c.slug}: ${w}`));
  } catch (err) {
    console.warn(`[sd-db] non-fatal (${c.slug}): ${err instanceof Error ? err.message : err}`);
  }
}

/** Syncs a saveResult() output: the case itself, plus any new legal_terms
 *  / precedent-stub cases it created as a side effect of processing a
 *  transcript that cited an unfamiliar term or precedent. */
async function dualWriteResult(result: ProcessingResult): Promise<void> {
  const ctx = await getDbContext();
  if (!ctx) return;
  try {
    for (const t of result.newTerms) await syncNewTerm(ctx.creds, t);
    for (const p of result.newPrecedents) await syncNewPrecedent(ctx.creds, ctx.cache, p);
  } catch (err) {
    console.warn(`[sd-db] non-fatal (${result.case.slug} new terms/precedents): ${err instanceof Error ? err.message : err}`);
  }
  await dualWriteCase(result.case);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCOTUS_BASE = "https://www.supremecourt.gov";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SupremeCourtWiki/1.0; +https://github.com/supreme-court-wiki)";

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
async function promoteArguedCases(existingSlugs: Set<string>): Promise<number> {
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
    if (argDate > today) continue;

    caseData.docketStatus = "petition";
    fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
    console.log(`  ✓ promoted to argued: ${caseData.title} (argued ${caseData.argumentDate})`);
    await dualWriteCase(caseData);
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
      await dualWriteResult(result);

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
  // The old argument_calendars.aspx (plural) URL now 302s to
  // /errors/PageNotFound.aspx -- confirmed by hand 2026-09-17. SCOTUS
  // moved this page to calendarsandlists.aspx and restructured it to
  // link out to monthly PDF calendars (MonthlyArgumentCal<Month><Year>.pdf)
  // instead of listing cases inline in the HTML, so this now downloads
  // and parses those PDFs the same way updateCalendar() below already
  // parses the case-distribution-schedule PDF.
  const listUrl = `${SCOTUS_BASE}/oral_arguments/calendarsandlists.aspx`;
  console.log(`\nFetching argument calendar list: ${listUrl}`);

  let listHtml: string;
  try {
    listHtml = await fetchHtml(listUrl);
  } catch (err) {
    console.warn(`  Could not fetch argument calendar list: ${err}`);
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // calendarsandlists.aspx links every session back to 2023, so filter to
  // near-term ones before downloading anything. Filenames don't always
  // match their own session's actual start date -- confirmed
  // MonthlyArgumentCalDecember2026.pdf's session actually opens November
  // 30 -- so keep a file if its NOMINAL month is the previous calendar
  // month or later, a one-month buffer that comfortably covers that kind
  // of slip either direction without pulling the whole multi-year archive.
  const pdfLinkPattern =
    /argument_calendars\/MonthlyArgumentCal([A-Za-z]+)(\d{4})\.pdf/g;
  const cutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const pdfUrls = new Set<string>();
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = pdfLinkPattern.exec(listHtml)) !== null) {
    const month = MONTH_MAP[linkMatch[1].toUpperCase()];
    const year = Number(linkMatch[2]);
    if (!month) continue;
    const nominalStart = new Date(year, month - 1, 1);
    if (nominalStart < cutoff) continue;
    pdfUrls.add(`${SCOTUS_BASE}/oral_arguments/${linkMatch[0]}`);
  }
  console.log(`  ${pdfUrls.size} monthly calendar(s) in range: ${[...pdfUrls].map((u) => u.split("/").pop()).join(", ")}`);

  const results: UpcomingCase[] = [];
  // "Monday, October 5" -- session PDFs group entries by weekday across
  // the whole two-week session (all Mondays, then all Tuesdays, ...), not
  // chronologically, so each heading's own date has to be parsed and
  // combined with the term-year header rather than assumed in order.
  const dateHeadingPattern =
    /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2}))/g;
  const caseNumPattern = /\b(\d{2}-\d{1,5})\b/g;

  for (const pdfUrl of pdfUrls) {
    const beforeCount = results.length;
    let text: string;
    try {
      const buf = await downloadPdf(pdfUrl);
      text = await extractText(buf);
    } catch (err) {
      console.warn(`  Could not fetch/parse ${pdfUrl}: ${err}`);
      continue;
    }

    // "OCTOBER TERM 2026" header -- the term SCOTUS itself assigns this
    // session to, more reliable than re-deriving it from a body date.
    const termMatch = text.match(/OCTOBER TERM\s+(\d{4})/i);
    if (!termMatch) {
      console.warn(`  No "OCTOBER TERM YYYY" header found in ${pdfUrl} (got ${text.length} chars) -- skipping`);
      continue;
    }
    const termStartYear = Number(termMatch[1]);

    // Real calendar content ends at the "Court convenes..." footer;
    // dropping it keeps it out of the last date heading's case title.
    const body = text.split(/Court\s+Convenes/i)[0];

    const sections = body.split(dateHeadingPattern);
    // sections: [pre, fullHeading, monthName, day, content, fullHeading, monthName, day, content, ...]
    for (let i = 1; i < sections.length; i += 4) {
      const month = MONTH_MAP[(sections[i + 1] ?? "").toUpperCase()];
      const day = Number(sections[i + 2]);
      const content = sections[i + 3] ?? "";
      if (!month || !day) continue;

      // OT is named for the year it STARTS in -- Oct/Nov/Dec dates fall
      // in that calendar year, everything else (Jan-Sep) in the next one.
      const calendarYear = month >= 10 ? termStartYear : termStartYear + 1;
      const parsed = new Date(calendarYear, month - 1, day);
      if (parsed < today) continue; // only future arguments (also skips "LEGAL HOLIDAY" content, which has no case numbers anyway)

      const argDateISO = `${calendarYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const termYear = String(termStartYear);

      const matches = [...content.matchAll(caseNumPattern)];
      for (let j = 0; j < matches.length; j++) {
        const caseNumber = matches[j][1];
        const start = matches[j].index! + matches[j][0].length;
        const end = j + 1 < matches.length ? matches[j + 1].index! : content.length;
        // Consolidated cases print as "25-238) TITLE ... 25-566) TITLE
        // ... (Consolidated - 1 hr. for argument)" -- strip the stray
        // ")" left by the case-number regex, the shared trailing
        // annotation, and the next entry's "(N)" index marker.
        const title = content
          .slice(start, end)
          .replace(/\(Consolidated[^)]*\)?/gi, "")
          .replace(/\(\d+\)\s*$/, "")
          .replace(/^\)\s*/, "")
          .replace(/\s+/g, " ")
          .trim();

        results.push({ caseNumber, title: title || caseNumber, argumentDate: argDateISO, termYear });
      }
    }
    console.log(`  ${pdfUrl.split("/").pop()}: ${results.length - beforeCount} upcoming case(s)`);
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
      await dualWriteResult(result);

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

async function updateDecidedCases(
  opinions: SlipOpinion[],
  existingSlugs: Set<string>
): Promise<number> {
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
    await dualWriteCase(caseData);
    updated++;
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Step 2b — Fill missing keyExchanges for promoted argued cases
// ---------------------------------------------------------------------------
//
// When a case is promoted from "upcoming" → "petition" by promoteArguedCases,
// it retains keyExchanges: [] from its stub. processNewTranscripts then skips
// it because it is no longer "upcoming". This step catches those cases once
// their transcript is published.

const KEY_EXCHANGES_SYSTEM = `You are a legal expert analyzing Supreme Court oral argument transcripts.
You always respond with valid JSON matching the exact schema provided. Do not include any text outside the JSON object.`;

function buildKeyExchangesPrompt(transcriptText: string, parties: string[]): string {
  const MAX_CHARS = 150_000;
  const trimmed =
    transcriptText.length > MAX_CHARS
      ? transcriptText.slice(0, MAX_CHARS) + "\n\n[TRANSCRIPT TRIMMED]"
      : transcriptText;
  return `Read this Supreme Court oral argument transcript and extract the most revealing exchanges between justices and each counsel.

Return a JSON object with EXACTLY this structure:
{
  "parties": [
    {
      "party": "<exact party name>",
      "keyExchanges": [
        {
          "justice": "Justice Name",
          "question": "What the justice asked (1-2 sentences)",
          "context": "Why this line of questioning matters (1 sentence)",
          "significance": "What it revealed about the justice's thinking (1 sentence)"
        }
      ]
    }
  ]
}

Rules:
- At most 3 keyExchanges per party — choose the most revealing ones only
- Match "party" exactly to one of: ${parties.map((p) => `"${p}"`).join(", ")}
- Return ONLY the JSON object, no other text

TRANSCRIPT:
${trimmed}`;
}

async function fillMissingKeyExchanges(
  client: Anthropic,
  transcripts: TranscriptEntry[],
  existingSlugs: Set<string>
): Promise<number> {
  const transcriptMap = new Map(transcripts.map((t) => [t.caseNumber, t.transcriptUrl]));
  let filled = 0;

  for (const slug of existingSlugs) {
    const filePath = path.join(CASES_DIR, `${slug}.json`);
    let caseData: CaseSummary;
    try {
      caseData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CaseSummary;
    } catch {
      continue;
    }

    // Only argued (petition) or decided cases need this
    if (caseData.docketStatus !== "petition" && caseData.docketStatus !== "decided") continue;

    const hasExchanges = caseData.parties.some(
      (p) => p.keyExchanges && p.keyExchanges.length > 0
    );
    if (hasExchanges) continue;

    const transcriptUrl = transcriptMap.get(caseData.caseNumber);
    if (!transcriptUrl) continue; // transcript not published yet

    console.log(`\n  Filling key exchanges for: ${caseData.title}`);
    try {
      const pdfBuffer = await downloadPdf(transcriptUrl);
      const text = await extractText(pdfBuffer);
      const partyNames = caseData.parties.map((p) => p.party);
      const model = process.env.MODEL ?? "claude-opus-4-6";

      const response = await withRetry(() =>
        client.messages.create({
          model,
          max_tokens: 8000,
          system: KEY_EXCHANGES_SYSTEM,
          messages: [
            { role: "user", content: buildKeyExchangesPrompt(text, partyNames) },
          ],
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlock = (response.content as any[]).find((b) => b.type === "text");
      if (!textBlock?.text) throw new Error("No text in response");

      const jsonMatch = (textBlock.text as string).match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");

      const result = JSON.parse(jsonMatch[0]) as {
        parties: Array<{ party: string; keyExchanges: CaseSummary["parties"][number]["keyExchanges"] }>;
      };

      for (const rp of result.parties) {
        const ep = caseData.parties.find((p) => p.party === rp.party);
        if (ep) ep.keyExchanges = rp.keyExchanges;
      }
      if (!caseData.transcriptUrl.endsWith(".pdf")) {
        caseData.transcriptUrl = transcriptUrl;
      }

      fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
      console.log(`  ✓ Key exchanges added for ${caseData.title}`);
      await dualWriteCase(caseData);
      filled++;
    } catch (err) {
      console.error(`  Error filling key exchanges for ${caseData.title}: ${err}`);
    }
  }

  return filled;
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
    // Merge/upsert this term's dates into the file rather than
    // overwriting it -- a prior run's flat single-term shape would have
    // been replaced by this term's alone, silently losing every other
    // tracked term's conference dates (confirmed: this is exactly what
    // happened to OT2025's dates on the first OT2026 pipeline run before
    // this fix).
    let calendarData: { terms: Record<string, { generated: string; conferences: string[] }> } = { terms: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(calendarPath, "utf-8"));
      if (parsed.terms) calendarData = parsed;
    } catch {
      // No existing file (or old pre-migration shape) -- start fresh.
    }
    calendarData.terms[termYear] = {
      generated: new Date().toISOString().split("T")[0],
      conferences: [...conferences].sort(),
    };
    fs.writeFileSync(calendarPath, JSON.stringify(calendarData, null, 2));
    console.log(`  ✓ calendar.json updated: ${conferences.size} conference dates for term ${termYear}`);
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
  const promoted = await promoteArguedCases(existingSlugs);

  // Step 1 + 2: New transcripts
  const transcripts = await fetchTranscriptList(termYear);
  const newTranscripts = await processNewTranscripts(
    client,
    transcripts,
    existingSlugs,
    termYear
  );

  // Step 2b: Fill key exchanges for any argued cases still missing them
  console.log("\nFilling missing key exchanges...");
  const keyExchangesFilled = await fillMissingKeyExchanges(client, transcripts, existingSlugs);

  // Step 3: Upcoming arguments
  const upcoming = await fetchUpcomingArguments();
  const newUpcoming = await processUpcomingCases(client, upcoming, existingSlugs);

  // Step 4: Slip opinions
  const opinions = await fetchSlipOpinions(termYear);
  const decisionsUpdated = await updateDecidedCases(opinions, existingSlugs);

  // Step 5: Conference calendar
  await updateCalendar(termYear);

  console.log("\n=== Summary ===");
  console.log(`  Cases promoted to argued  : ${promoted}`);
  console.log(`  New transcripts processed : ${newTranscripts}`);
  console.log(`  Key exchanges backfilled  : ${keyExchangesFilled}`);
  console.log(`  Upcoming cases added      : ${newUpcoming}`);
  console.log(`  Decisions updated         : ${decisionsUpdated}`);
  console.log(`  Total changes             : ${promoted + newTranscripts + keyExchangesFilled + newUpcoming + decisionsUpdated}`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
