/**
 * fetch-opinion-authors.ts
 *
 * Scrapes the SCOTUS slip-opinions page, downloads each opinion PDF,
 * parses who authored the majority, concurrences, and dissents, then
 * writes that information back into the matching data/cases/*.json file
 * and marks the case docketStatus as "decided".
 *
 * Run:  npx tsx scripts/fetch-opinion-authors.ts
 */

import * as fs from "fs";
import * as path from "path";
import { downloadPdf, extractText, CASES_DIR } from "./pipeline.js";
import type { CaseSummary } from "../src/types/index.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOTUS_BASE = "https://www.supremecourt.gov";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SupremeCourtWiki/1.0; +https://github.com/supreme-court-wiki)";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function currentShortTermYear(): string {
  const now = new Date();
  const fullYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return String(fullYear).slice(2);
}

// ── Slip opinions list ────────────────────────────────────────────────────────

interface SlipOpinion {
  caseNumber: string;
  pdfUrl: string;
  decisionDate?: string; // YYYY-MM-DD
}

async function fetchSlipOpinions(shortYear: string): Promise<SlipOpinion[]> {
  const url = `${SCOTUS_BASE}/opinions/slipopinion/${shortYear}`;
  console.log(`Fetching slip opinions: ${url}`);
  const html = await fetchHtml(url);

  // Process row-by-row so we can associate dates with PDF links
  const seen = new Set<string>();
  const results: SlipOpinion[] = [];

  // Split on <tr — each chunk is one table row's content
  for (const row of html.split(/<tr[\s>]/i)) {
    const pdfMatch = /href='(\/opinions\/\d+pdf\/([^'_/]+)([^']*\.pdf))'/i.exec(row);
    if (!pdfMatch) continue;

    const pdfPath = pdfMatch[1];
    const caseNumber = pdfMatch[2];
    const isRevision = pdfPath.includes("new_");

    // Extract date — SCOTUS uses M/D/YY or MM/DD/YY in the first <td>
    let decisionDate: string | undefined;
    const dateMatch = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(row);
    if (dateMatch) {
      const mm = dateMatch[1].padStart(2, "0");
      const dd = dateMatch[2].padStart(2, "0");
      const yr = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
      decisionDate = `${yr}-${mm}-${dd}`;
    }

    if (seen.has(caseNumber)) {
      // Replace with revised version
      if (isRevision) {
        const existing = results.find((r) => r.caseNumber === caseNumber);
        if (existing) {
          existing.pdfUrl = `${SCOTUS_BASE}${pdfPath}`;
          if (decisionDate) existing.decisionDate = decisionDate;
        }
      }
    } else {
      seen.add(caseNumber);
      results.push({ caseNumber, pdfUrl: `${SCOTUS_BASE}${pdfPath}`, decisionDate });
    }
  }

  console.log(`  Found ${results.length} slip opinions`);
  return results;
}

// ── Opinion PDF parser ────────────────────────────────────────────────────────

const JUSTICE_NAMES = [
  "ROBERTS", "THOMAS", "ALITO", "SOTOMAYOR", "KAGAN",
  "GORSUCH", "KAVANAUGH", "BARRETT", "JACKSON",
];

function justiceKey(name: string): string {
  return name.toLowerCase();
}

function extractJusticeName(fragment: string): string | null {
  const up = fragment.toUpperCase();
  for (const n of JUSTICE_NAMES) {
    if (up.includes(n)) return justiceKey(n);
  }
  return null;
}

interface OpinionAuthors {
  majorityAuthor: string | null;
  concurrenceAuthors: string[];
  dissentAuthors: string[];
}

/**
 * Normalise a raw name fragment from the PDF (may have spacing artifacts
 * like "K AVANAUGH" or "G ORSUCH") to a justice key.
 */
function nameFragmentToKey(raw: string): string | null {
  // Strip all whitespace and compare against known justice names
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  for (const n of JUSTICE_NAMES) {
    if (compact.includes(n)) return justiceKey(n);
  }
  return null;
}

/**
 * Detect whether the petitioner won by looking for "judgment...reversed/vacated"
 * (petitioner wins) or "judgment...affirmed" (respondent wins) in the syllabus.
 */
function detectPetitionerWon(rawText: string): boolean | null {
  const text = rawText
    .slice(0, 10000)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ");

  const reversedRe = /\bjudgment\b[^.]{0,300}?\b(reversed|vacated)\b/i;
  const affirmedRe  = /\bjudgment\b[^.]{0,300}?\baffirmed\b/i;

  const rm = reversedRe.exec(text);
  const am = affirmedRe.exec(text);

  if (rm && (!am || rm.index < am.index)) return true;
  if (am) return false;

  // Fallback: standalone verdict words
  if (/\bReversed\b/.test(text)) return true;
  if (/\bVacated\b/.test(text))  return true;
  if (/\bAffirmed\b/.test(text)) return false;

  return null;
}

function parseOpinionAuthors(rawText: string): OpinionAuthors {
  // SCOTUS slip-opinion PDFs use the syllabus format:
  //   "THOMAS, J., delivered the opinion of the Court, in which ROBERTS, C. J., ..."
  //   "SOTOMAYOR , J., filed a dissenting opinion, ..."
  //   "KAVANAUGH, J., filed a concurring opinion."
  // Justice last names may contain PDF spacing artifacts like "K AVANAUGH".
  //
  // Work on the full text so we don't miss multi-page syllabi.
  const text = rawText.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");

  // ── Majority ──────────────────────────────────────────────────────────────
  let majorityAuthor: string | null = null;

  // "THOMAS, J., delivered the opinion" OR "ROBERTS, C. J., delivered the opinion"
  const majorityRe = /([A-Z][A-Z\s]{0,20}?),\s*(?:C\.\s*J\.|J\.),\s*delivered the opinion/gi;
  const majorityMatch = majorityRe.exec(text);
  if (majorityMatch) {
    majorityAuthor = nameFragmentToKey(majorityMatch[1]);
  } else if (/\bPER CURIAM\b/.test(text.slice(0, 8000))) {
    majorityAuthor = "per_curiam";
  }

  // ── Concurrences ─────────────────────────────────────────────────────────
  const concurrenceAuthors: string[] = [];
  // "KAVANAUGH, J., filed a concurring opinion"  OR  "...concurred in the judgment"
  const concurrenceRe =
    /([A-Z][A-Z\s]{0,20}?),\s*(?:C\.\s*J\.|J\.),\s*(?:filed a concurring|concurr)/gi;
  let cm: RegExpExecArray | null;
  while ((cm = concurrenceRe.exec(text)) !== null) {
    const key = nameFragmentToKey(cm[1]);
    if (key && !concurrenceAuthors.includes(key)) concurrenceAuthors.push(key);
  }

  // ── Dissents ──────────────────────────────────────────────────────────────
  const dissentAuthors: string[] = [];
  // "SOTOMAYOR, J., filed a dissenting opinion"
  const dissentRe =
    /([A-Z][A-Z\s]{0,20}?),\s*(?:C\.\s*J\.|J\.),\s*filed a dissenting/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dissentRe.exec(text)) !== null) {
    const key = nameFragmentToKey(dm[1]);
    if (key && !dissentAuthors.includes(key)) dissentAuthors.push(key);
  }

  return { majorityAuthor, concurrenceAuthors, dissentAuthors };
}

// ── Case file helpers ─────────────────────────────────────────────────────────

function findCaseFile(caseNumber: string): string | null {
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  const prefix = caseNumber.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const match = files.find((f) => f.startsWith(prefix));
  return match ? path.join(CASES_DIR, match) : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const shortYear = currentShortTermYear();
  const opinions = await fetchSlipOpinions(shortYear);

  let updated = 0;
  let skipped = 0;

  for (const { caseNumber, pdfUrl, decisionDate } of opinions) {
    const filePath = findCaseFile(caseNumber);
    if (!filePath) {
      console.log(`  – ${caseNumber}: not in DB, skipping`);
      skipped++;
      continue;
    }

    let caseData: CaseSummary;
    try {
      caseData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CaseSummary;
    } catch {
      skipped++;
      continue;
    }

    // Skip only if we already have author info, petitionerWon, AND decisionDate
    if (
      caseData.docketStatus === "decided" &&
      caseData.majorityAuthor &&
      caseData.majorityAuthor !== "unknown" &&
      "petitionerWon" in caseData &&
      caseData.decisionDate
    ) {
      console.log(`  ✓ ${caseNumber}: already processed (${caseData.majorityAuthor})`);
      skipped++;
      continue;
    }

    console.log(`Processing ${caseNumber} — ${caseData.title}`);
    console.log(`  PDF: ${pdfUrl}`);

    try {
      const buf = await downloadPdf(pdfUrl);
      const text = await extractText(buf);
      const authors = parseOpinionAuthors(text);
      const petitionerWon = detectPetitionerWon(text);

      caseData.docketStatus = "decided";
      if (decisionDate) caseData.decisionDate = decisionDate;
      caseData.outcome = caseData.outcome ?? `Opinion filed. See: ${pdfUrl}`;
      if (authors.majorityAuthor) caseData.majorityAuthor = authors.majorityAuthor;
      caseData.concurrenceAuthors = authors.concurrenceAuthors.length
        ? authors.concurrenceAuthors
        : undefined;
      caseData.dissentAuthors = authors.dissentAuthors.length
        ? authors.dissentAuthors
        : undefined;
      caseData.petitionerWon = petitionerWon;

      fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
      console.log(
        `  ✓ majority=${authors.majorityAuthor ?? "unknown"} ` +
        `concurrences=[${authors.concurrenceAuthors.join(",")}] ` +
        `dissents=[${authors.dissentAuthors.join(",")}] ` +
        `petitionerWon=${petitionerWon}`
      );
      updated++;
    } catch (err) {
      console.warn(`  ✗ ${caseNumber}: ${err}`);
    }
  }

  console.log(`\n✓ Updated ${updated} cases, skipped ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
