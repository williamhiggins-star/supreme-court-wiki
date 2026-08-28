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
import Anthropic from "@anthropic-ai/sdk";
import { downloadPdf, extractText, CASES_DIR } from "./pipeline.js";
import type { CaseSummary } from "../src/types/index.js";
import { getCredentials, type SupabaseCredentials } from "./lib/supabase-sync/env.js";
import { loadIdCache, syncCase, type IdCache } from "./lib/sd-db/write.js";

// ---------------------------------------------------------------------------
// Dual-write (Phase 3, SUPABASE_PLAN.md) — data/cases/*.json stays the
// source of truth the site renders from; this is purely additive and
// never blocks or fails the JSON write it follows. Cache loaded once (lazily)
// and reused across every case this run touches.
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

interface JoinedOpinion {
  author: string;
  joinedBy: string[];
}

interface OpinionAuthors {
  majorityAuthor: string | null;
  /** Justices who joined the majority opinion without writing separately —
   *  from the syllabus's "delivered the opinion of the Court, in which
   *  X, Y, and Z, JJ., joined" clause. */
  majorityJoinedBy: string[];
  concurrenceAuthors: string[];
  /** One entry per concurrence author, with who (if anyone) joined THAT
   *  specific concurrence. */
  concurrences: JoinedOpinion[];
  dissentAuthors: string[];
  /** One entry per dissent author, with who (if anyone) joined THAT
   *  specific dissent. */
  dissents: JoinedOpinion[];
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

/** Every justice name found anywhere in `raw` (order doesn't matter — this
 *  feeds a "who joined" set, not an ordered list). */
function extractJusticeKeysFromJoinText(raw: string): string[] {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const found: string[] = [];
  for (const n of JUSTICE_NAMES) {
    if (compact.includes(n)) found.push(justiceKey(n));
  }
  return found;
}

/**
 * Scans the text from `matchEnd` up to (not including) the next occurrence
 * of the word "joined" for justice names — this is how the "in which X, Y,
 * and Z, JJ., joined" clause is pulled out, without needing a second, more
 * fragile regex tied to the exact surrounding phrasing.
 *
 * Deliberately NOT bounded on "the next period": "C. J." (Chief Justice)
 * and "J." (Justice) are themselves periods, and appear inside the very
 * names being scanned for — e.g. "...in which ROBERTS, C. J., and THOMAS,
 * ALITO, KAVANAUGH, and BARRETT, JJ., joined." would get truncated after
 * "ROBERTS," by a naive first-period search, silently dropping every other
 * joiner. If "joined" doesn't appear within `maxLen`, returns [] rather
 * than guessing — no join clause found is safer than scanning arbitrary
 * trailing text for justice-name false positives.
 *
 * Known limitation: doesn't distinguish full joins from partial ones
 * ("joined as to Parts I and II") — those still register as a join.
 */
function joinersAfter(text: string, matchEnd: number, excludeKey: string | null, maxLen = 500): string[] {
  const window = text.slice(matchEnd, matchEnd + maxLen);
  const joinedIdx = window.search(/\bjoined\b/i);
  if (joinedIdx === -1) return [];
  const clause = window.slice(0, joinedIdx);
  return extractJusticeKeysFromJoinText(clause).filter((k) => k !== excludeKey);
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
  let majorityJoinedBy: string[] = [];

  // "THOMAS, J., delivered the opinion" OR "ROBERTS, C. J., delivered the opinion"
  const majorityRe = /([A-Z][A-Z\s]{0,20}?),\s*(?:C\.\s*J\.|J\.),\s*delivered the opinion/gi;
  const majorityMatch = majorityRe.exec(text);
  if (majorityMatch) {
    majorityAuthor = nameFragmentToKey(majorityMatch[1]);
    majorityJoinedBy = joinersAfter(text, majorityMatch.index + majorityMatch[0].length, majorityAuthor);
  } else if (/\bPER CURIAM\b/.test(text.slice(0, 8000))) {
    majorityAuthor = "per_curiam";
  }

  // ── Concurrences ─────────────────────────────────────────────────────────
  const concurrenceAuthors: string[] = [];
  const concurrences: JoinedOpinion[] = [];
  // "KAVANAUGH, J., filed a concurring opinion"  OR  "...concurred in the judgment"
  const concurrenceRe =
    /([A-Z][A-Z\s]{0,20}?),\s*(?:C\.\s*J\.|J\.),\s*(?:filed a concurring|concurr)/gi;
  let cm: RegExpExecArray | null;
  while ((cm = concurrenceRe.exec(text)) !== null) {
    const key = nameFragmentToKey(cm[1]);
    if (key && !concurrenceAuthors.includes(key)) {
      concurrenceAuthors.push(key);
      concurrences.push({ author: key, joinedBy: joinersAfter(text, cm.index + cm[0].length, key) });
    }
  }

  // ── Dissents ──────────────────────────────────────────────────────────────
  const dissentAuthors: string[] = [];
  const dissents: JoinedOpinion[] = [];
  // "SOTOMAYOR, J., filed a dissenting opinion"
  const dissentRe =
    /([A-Z][A-Z\s]{0,20}?),\s*(?:C\.\s*J\.|J\.),\s*filed a dissenting/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dissentRe.exec(text)) !== null) {
    const key = nameFragmentToKey(dm[1]);
    if (key && !dissentAuthors.includes(key)) {
      dissentAuthors.push(key);
      dissents.push({ author: key, joinedBy: joinersAfter(text, dm.index + dm[0].length, key) });
    }
  }

  return { majorityAuthor, majorityJoinedBy, concurrenceAuthors, concurrences, dissentAuthors, dissents };
}

// ── Opinion summaries via Claude ──────────────────────────────────────────────

interface OpinionSummaries {
  majorityOpinionSummary: string;
  concurringSummaries: { author: string; summary: string }[];
  dissentSummaries: { author: string; summary: string }[];
}

async function generateOpinionSummaries(
  client: Anthropic,
  opinionText: string,
  authors: OpinionAuthors,
  caseTitle: string
): Promise<OpinionSummaries> {
  const MAX_CHARS = 120_000;
  const trimmed = opinionText.length > MAX_CHARS
    ? opinionText.slice(0, MAX_CHARS) + "\n\n[TEXT TRIMMED]"
    : opinionText;

  const concurrenceList = authors.concurrenceAuthors.join(", ") || "none";
  const dissentList = authors.dissentAuthors.join(", ") || "none";
  const majorityLabel = authors.majorityAuthor === "per_curiam"
    ? "per curiam (unsigned)"
    : authors.majorityAuthor ?? "unknown";

  const prompt = `You are summarizing a US Supreme Court opinion for a general audience. Write clearly for non-lawyers.

Case: ${caseTitle}
Majority author: ${majorityLabel}
Concurrence authors: ${concurrenceList}
Dissent authors: ${dissentList}

Return a JSON object with EXACTLY this structure (no other text):
{
  "majorityOpinionSummary": "2–3 paragraphs summarising the majority opinion: what the Court held, the key reasoning, and the practical effect. Plain English.",
  "concurringSummaries": [
    { "author": "justice_key_lowercase", "summary": "1–2 paragraphs summarising this justice's concurrence." }
  ],
  "dissentSummaries": [
    { "author": "justice_key_lowercase", "summary": "1–2 paragraphs summarising this justice's dissent." }
  ]
}

Rules:
- Use the exact lowercase justice key (roberts, thomas, alito, sotomayor, kagan, gorsuch, kavanaugh, barrett, jackson, per_curiam) for author fields.
- Only include entries for justices listed above. If concurrenceList or dissentList is "none", return an empty array.
- Separate paragraphs with a blank line (\\n\\n).
- Return only the JSON object.

OPINION TEXT:
${trimmed}`;

  const response = await client.messages.create({
    model: process.env.MODEL ?? "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Extract the first balanced JSON object using bracket counting
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("No JSON found in Claude response");
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error("Unbalanced JSON in Claude response");
  return JSON.parse(raw.slice(start, end + 1)) as OpinionSummaries;
}

// ── Case file helpers ─────────────────────────────────────────────────────────

function findCaseFile(caseNumber: string): string | null {
  // Strip trailing "new" suffix — revised opinions appear on SCOTUS as e.g. "24-568new"
  const clean = caseNumber.replace(/new$/i, "").trim();
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  const prefix = clean.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const match = files.find((f) => f.startsWith(prefix));
  return match ? path.join(CASES_DIR, match) : null;
}

/** True once a case's join data has been backfilled (or was already there) —
 *  used only by --backfill-joins to decide what still needs work. */
function hasJoinData(c: CaseSummary): boolean {
  return (
    c.majorityJoinedBy !== undefined ||
    (c.concurringSummaries ?? []).some((s) => s.joinedBy !== undefined) ||
    (c.dissentSummaries ?? []).some((s) => s.joinedBy !== undefined)
  );
}

// ── --backfill-joins ─────────────────────────────────────────────────────────
//
// Cheap, no-Claude-call backfill for cases that are already fully processed
// (decided, has summaries) but predate the join-clause parsing added to
// parseOpinionAuthors(). Reads every already-decided case file directly off
// disk and re-downloads its opinion PDF from the URL already recorded in
// `outcome` (every processed case has one) rather than re-scraping and
// matching against the live slip-opinions listing page — that page only
// reflects opinions posted in the CURRENT scrape window, so cases decided
// earlier in the term can silently drop off it. Re-parses with the fixed
// regex and patches majorityJoinedBy / per-author joinedBy onto the
// existing file — never touches majorityAuthor, petitionerWon, or
// re-calls Claude for summaries that are already correct.

function findDecidedCasesNeedingJoins(): Array<{ filePath: string; caseData: CaseSummary; pdfUrl: string }> {
  const work: Array<{ filePath: string; caseData: CaseSummary; pdfUrl: string }> = [];
  for (const f of fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"))) {
    const filePath = path.join(CASES_DIR, f);
    let caseData: CaseSummary;
    try {
      caseData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CaseSummary;
    } catch {
      continue;
    }
    const isDecidedWithAuthor =
      caseData.docketStatus === "decided" && caseData.majorityAuthor && caseData.majorityAuthor !== "unknown";
    if (!isDecidedWithAuthor || hasJoinData(caseData)) continue;

    const urlMatch = /https?:\/\/\S+?\.pdf/.exec(caseData.outcome ?? "");
    if (!urlMatch) continue; // no recorded PDF URL to (re-)download from — nothing this pass can do
    work.push({ filePath, caseData, pdfUrl: urlMatch[0] });
  }
  return work;
}

async function runBackfillJoins(): Promise<void> {
  const work = findDecidedCasesNeedingJoins();
  console.log(`Found ${work.length} decided case(s) missing join data.`);

  let updated = 0;
  for (const { filePath, caseData, pdfUrl } of work) {
    console.log(`Backfilling joins: ${caseData.caseNumber} — ${caseData.title}`);
    try {
      const buf = await downloadPdf(pdfUrl);
      const text = await extractText(buf);
      const authors = parseOpinionAuthors(text);

      caseData.majorityJoinedBy = authors.majorityJoinedBy.length ? authors.majorityJoinedBy : undefined;
      for (const s of caseData.concurringSummaries ?? []) {
        const match = authors.concurrences.find((c) => c.author === s.author);
        if (match?.joinedBy.length) s.joinedBy = match.joinedBy;
      }
      for (const s of caseData.dissentSummaries ?? []) {
        const match = authors.dissents.find((d) => d.author === s.author);
        if (match?.joinedBy.length) s.joinedBy = match.joinedBy;
      }

      fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
      console.log(`  ✓ majorityJoinedBy=[${(caseData.majorityJoinedBy ?? []).join(",")}]`);
      await dualWriteCase(caseData);
      updated++;
    } catch (err) {
      console.warn(`  ✗ ${caseData.caseNumber}: ${err}`);
    }
  }

  console.log(`\n✓ Updated ${updated} of ${work.length} case(s).`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes("--backfill-joins")) {
    await runBackfillJoins();
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

    // Skip only if fully processed: authors, petitionerWon, decisionDate, AND opinion summaries
    if (
      caseData.docketStatus === "decided" &&
      caseData.majorityAuthor &&
      caseData.majorityAuthor !== "unknown" &&
      "petitionerWon" in caseData &&
      caseData.decisionDate &&
      caseData.majorityOpinionSummary
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
      // Dissent takes priority — remove any justice from concurrences if they also dissented
      const dissentSet = new Set(authors.dissentAuthors);
      const filteredConcurrences = authors.concurrenceAuthors.filter((k) => !dissentSet.has(k));
      const filteredConcurrenceJoins = authors.concurrences.filter((c) => !dissentSet.has(c.author));
      caseData.concurrenceAuthors = filteredConcurrences.length ? filteredConcurrences : undefined;
      caseData.dissentAuthors = authors.dissentAuthors.length ? authors.dissentAuthors : undefined;
      caseData.petitionerWon = petitionerWon;
      caseData.majorityJoinedBy = authors.majorityJoinedBy.length ? authors.majorityJoinedBy : undefined;

      // Generate opinion summaries via Claude
      const effectiveAuthors: OpinionAuthors = {
        majorityAuthor: caseData.majorityAuthor ?? null,
        majorityJoinedBy: authors.majorityJoinedBy,
        concurrenceAuthors: filteredConcurrences,
        concurrences: filteredConcurrenceJoins,
        dissentAuthors: caseData.dissentAuthors ?? [],
        dissents: authors.dissents,
      };
      console.log(`  Generating opinion summaries...`);
      const summaries = await generateOpinionSummaries(client, text, effectiveAuthors, caseData.title);
      caseData.majorityOpinionSummary = summaries.majorityOpinionSummary;
      caseData.concurringSummaries = summaries.concurringSummaries.length
        ? summaries.concurringSummaries.map((s) => {
            const match = effectiveAuthors.concurrences.find((c) => c.author === s.author);
            return match?.joinedBy.length ? { ...s, joinedBy: match.joinedBy } : s;
          })
        : undefined;
      caseData.dissentSummaries = summaries.dissentSummaries.length
        ? summaries.dissentSummaries.map((s) => {
            const match = effectiveAuthors.dissents.find((d) => d.author === s.author);
            return match?.joinedBy.length ? { ...s, joinedBy: match.joinedBy } : s;
          })
        : undefined;

      fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2));
      console.log(
        `  ✓ majority=${authors.majorityAuthor ?? "unknown"} ` +
        `concurrences=[${authors.concurrenceAuthors.join(",")}] ` +
        `dissents=[${authors.dissentAuthors.join(",")}] ` +
        `petitionerWon=${petitionerWon} summaries=✓`
      );
      await dualWriteCase(caseData);
      updated++;
    } catch (err) {
      console.warn(`  ✗ ${caseNumber}: ${err}`);
    }
  }

  console.log(`\n✓ Updated ${updated} cases, skipped ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
