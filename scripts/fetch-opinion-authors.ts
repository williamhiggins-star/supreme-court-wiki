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

export interface JoinedOpinion {
  author: string;
  joinedBy: string[];
}

export interface OpinionAuthors {
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
  /** Justices who filed an opinion concurring in part AND dissenting in
   *  part — a distinct opinion type, not a plain concurrence or dissent. */
  concurDissentAuthors: string[];
  concurDissents: JoinedOpinion[];
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
 * joiner.
 *
 * IS bounded on the next opinion announcement's own verb (",\s*DESIGNATOR,\s*
 * (?:filed|delivered)"), found via the same structured pattern the rest of
 * this file uses rather than fragile period-scanning — a real syllabus
 * sentence for a justice with no "joined" clause of their own (e.g. a solo
 * concur/dissent) is immediately followed by the NEXT justice's
 * announcement, and without this bound that next sentence's OWN "joined"
 * clause gets misattributed here. Deliberately keyed on "filed"/"delivered"
 * specifically (not just any designator) so this does NOT trigger on a
 * joiner's own "NAME, J., joined" within the CURRENT clause, nor on a
 * multi-name join list that itself contains "ROBERTS, C. J., and THOMAS,
 * ..., JJ., joined" — both of those have a designator followed by "joined"
 * or "and", never by "filed"/"delivered". If "joined" doesn't appear before
 * either boundary, returns [] — no join clause found is safer than
 * scanning arbitrary trailing text for justice-name false positives.
 *
 * A single opinion can be joined via MORE THAN ONE "in which ... joined"
 * clause — e.g. "in which SOTOMAYOR, J., joined, and in which KAGAN, J.,
 * joined as to Parts I and II." Each "in which" segment is scanned
 * independently (split on "in which", not on the first "joined") so a
 * second/third partial joiner isn't silently dropped just because an
 * earlier joiner was already found.
 *
 * Known limitation: doesn't distinguish full joins from partial ones
 * ("joined as to Parts I and II") — those still register as a join.
 */
function joinersAfter(text: string, matchEnd: number, excludeKeys: string[], maxLen = 500): string[] {
  let window = text.slice(matchEnd, matchEnd + maxLen);
  const nextClauseRe = new RegExp(String.raw`,\s*${DESIGNATOR},\s*(?:filed|delivered)\b`, "i");
  const nextClause = nextClauseRe.exec(window);
  if (nextClause) window = window.slice(0, nextClause.index);
  if (!/\bjoined\b/i.test(window)) return [];

  const exclude = new Set(excludeKeys);
  const found = new Set<string>();
  // Text before the first "in which" is the opinion's own verb clause
  // ("filed a dissenting opinion"), not part of any join list — drop it.
  const segments = window.split(/\bin which\b/i).slice(1);
  for (const segment of segments) {
    const joinedIdx = segment.search(/\bjoined\b/i);
    if (joinedIdx === -1) continue;
    for (const key of extractJusticeKeysFromJoinText(segment.slice(0, joinedIdx))) {
      if (!exclude.has(key)) found.add(key);
    }
  }
  return [...found];
}

/**
 * Justice designator as it appears right before the verb clause: "J.,"
 * for a single justice, "C. J.," for the Chief Justice, or "JJ.," when
 * a clause announces MULTIPLE justices together (e.g. "ALITO and
 * GORSUCH, JJ., filed dissenting opinions." — each filed a SEPARATE
 * opinion, with no "joined" clause implied). The original regexes only
 * matched the singular "J."/"C. J." forms, so any justice named only in
 * a plural "JJ." announcement was silently dropped from every author
 * list — a solo dissenter (or concurrer) could vanish entirely.
 */
const DESIGNATOR = String.raw`(?:C\.\s*J\.|JJ\.|J\.)`;

/**
 * Finds every justice name in the sentence leading up to `designatorIndex`
 * (the start of ",\s*DESIGNATOR,"). Bounded to the current sentence (the
 * text after the nearest preceding ". ") so this can't reach back into a
 * PRIOR justice's opinion announcement.
 */
function subjectsBefore(text: string, designatorIndex: number, maxLookback = 100): string[] {
  const start = Math.max(0, designatorIndex - maxLookback);
  let window = text.slice(start, designatorIndex);
  const lastPeriod = window.lastIndexOf(". ");
  if (lastPeriod !== -1) window = window.slice(lastPeriod + 2);
  return extractJusticeKeysFromJoinText(window);
}

/**
 * Scans `text` for `,\s*DESIGNATOR,\s*VERB` clauses and returns one
 * JoinedOpinion per justice named in the subject before the designator.
 *
 * When the designator is plural ("JJ.") — multiple justices announced
 * together as each having filed their OWN opinion — joinedBy is left
 * empty for all of them: that's what the plural construction means
 * ("filed dissenting opinions", not "filed a dissenting opinion, in
 * which ... joined"). Only a singular designator looks for a trailing
 * "in which ... joined" clause.
 */
function scanOpinionClauses(
  text: string,
  verbPattern: string,
  exclude: Set<string>
): JoinedOpinion[] {
  const re = new RegExp(String.raw`,\s*(${DESIGNATOR}),\s*(?:${verbPattern})`, "gi");
  const results: JoinedOpinion[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const isPlural = /^JJ\.$/i.test(m[1]);
    const subjects = subjectsBefore(text, m.index);
    for (const key of subjects) {
      if (exclude.has(key) || results.some((r) => r.author === key)) continue;
      // Only exclude the opinion's OWN author from its joiner list — NOT
      // `exclude` (that set is for keeping, say, a concur/dissent author
      // from ALSO being misclassified as a plain dissent AUTHOR). A
      // justice can simultaneously author one opinion and separately join
      // a DIFFERENT one — e.g. Cisco Systems v. Doe I: Jackson authors her
      // own concur/dissent, joined by Kagan, AND separately partially
      // joins Sotomayor's dissent ("in which KAGAN and JACKSON, JJ.,
      // joined as to Parts I–III and V"). Threading the full author-
      // classification `exclude` set in here silently dropped Jackson
      // from Sotomayor's joinedBy just because she'd already been
      // classified as the concur/dissent's author.
      const joinedBy = isPlural ? [] : joinersAfter(text, m.index + m[0].length, [key]);
      results.push({ author: key, joinedBy });
    }
  }
  return results;
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

/**
 * Boilerplate the Reporter of Decisions places at the top of every slip
 * opinion, immediately after the syllabus ends and the actual "Opinion of
 * the Court" text begins.
 */
const OPINION_BODY_START_RE = /NOTICE:\s*This opinion is subject to formal revision/i;

/** Hard cap used only when OPINION_BODY_START_RE isn't found (e.g. an
 *  unusual format) — real syllabi are well under this. */
const SYLLABUS_FALLBACK_MAX_CHARS = 20_000;

export function parseOpinionAuthors(rawText: string): OpinionAuthors {
  // SCOTUS slip-opinion PDFs use the syllabus format:
  //   "THOMAS, J., delivered the opinion of the Court, in which ROBERTS, C. J., ..."
  //   "SOTOMAYOR, J., filed a dissenting opinion, ..."
  //   "KAVANAUGH, J., filed a concurring opinion."
  //   "KAVANAUGH, J., filed an opinion concurring in part and dissenting in part."
  //   "ALITO and GORSUCH, JJ., filed dissenting opinions." (each filed a SEPARATE
  //     opinion — plural "JJ.", no join between them)
  // Justice last names may contain PDF spacing artifacts like "K AVANAUGH".
  // PDF line-wrap hyphenation: a word broken across a line ("...dissenting
  // opin-\nion...") must be rejoined BEFORE collapsing newlines to spaces —
  // otherwise "opin-" + " ion" never matches "\s*opinions?" and the whole
  // clause (author, joiners, everyone in it) silently vanishes. Keyed on
  // hyphen immediately followed by a newline (not just any "word- word",
  // which could be legitimate spacing) so this can't misfire mid-line.
  const dehyphenated = rawText.replace(/(\w)-\n\s*(\w)/g, "$1$2");
  // PDF page-break furniture: whenever a sentence happens to span a page
  // boundary, the extractor splices in "\n\n-- N of M --\n\n<page#> <CASE
  // NAME>\n<running head>\n" right in the middle of it — e.g. "...filed
  // a\n\n-- 5 of 83 --\n\n6  TRUMP v. COOK\nSyllabus\ndissenting opinion."
  // Left in place, this breaks contiguity for any designator/verb pattern
  // that happens to straddle a page (found via Trump v. Cook: "filed a"
  // and "dissenting opinion" ended up on opposite sides of a page break).
  // The marker + page-number/caption line + running-head line are always
  // exactly this newline-delimited shape, so they can be stripped by
  // structure without needing to know what the running head says.
  const depaginated = dehyphenated.replace(/\n\n--\s*\d+\s+of\s+\d+\s*--\n\n\d+[^\n]*\n[^\n]*\n/g, " ");
  const normalized = depaginated.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");

  // Scan ONLY the syllabus, not the full multi-page opinion body. The body
  // of a real opinion is riddled with citations to OTHER cases that use the
  // exact same "(NAME, J., concurring)" / "(NAME, J., dissenting)" format
  // as a Bluebook citation parenthetical (e.g. citing United States v.
  // Vaello Madero as "(THOMAS, J., concurring)") — those aren't statements
  // about who wrote what in THIS case, but the designator/verb regexes
  // below can't tell the difference. Scanning the full text (as this
  // function used to) let such citations inject phantom authors. The
  // syllabus's own authorship line is a single, clean, self-contained
  // block right at its end, so bounding the scan there eliminates the
  // false-positive surface entirely without losing anything real.
  const bodyStart = OPINION_BODY_START_RE.exec(normalized);
  const syllabus = bodyStart ? normalized.slice(0, bodyStart.index) : normalized.slice(0, SYLLABUS_FALLBACK_MAX_CHARS);

  // The syllabus ISN'T clean end-to-end either: its own "Held:" discussion
  // cites other precedents the same Bluebook-parenthetical way — e.g.
  // citing Christian Legal Society v. Martinez as "(THOMAS, J., concurring
  // in part and c[oncurring in judgment])", or Hollingsworth v. Perry as
  // "(per curiam)" — well before the real authorship paragraph. Only the
  // announcement paragraph itself — from the majority's "delivered the
  // opinion"/"PER CURIAM" onward — is safe to scan for concurrence/dissent/
  // concur-dissent designators. "(?<!\()PER CURIAM\b(?!\))" specifically
  // excludes "per curiam" used as a parenthetical citation descriptor
  // (always lowercase and wrapped in parens in that role — a real
  // announcement heading is neither).
  const announcementRe = new RegExp(String.raw`,\s*${DESIGNATOR},\s*delivered the opinion|(?<!\()PER CURIAM\b(?!\))`, "i");
  const announcementMatch = announcementRe.exec(syllabus);
  // Keep a lookback buffer before the match — it starts at the comma right
  // AFTER the justice's surname (",\s*DESIGNATOR,..."), and subjectsBefore()
  // needs that name still present to look backward into.
  const text = announcementMatch ? syllabus.slice(Math.max(0, announcementMatch.index - 100)) : syllabus;

  // ── Majority ──────────────────────────────────────────────────────────────
  let majorityAuthor: string | null = null;
  let majorityJoinedBy: string[] = [];

  const majorityMatches = scanOpinionClauses(text, "delivered the opinion", new Set());
  if (majorityMatches.length) {
    majorityAuthor = majorityMatches[0].author;
    majorityJoinedBy = majorityMatches[0].joinedBy;
    // A unanimous decision is announced as "delivered the opinion for a
    // unanimous Court" instead of listing each joiner by name — there's no
    // "in which ... joined" clause at all, so joinersAfter correctly finds
    // nothing there. Without this, majorityJoinedBy silently comes back
    // empty for every unanimous case (confirmed against several real slip
    // opinions during the 2025-term backfill audit).
    if (/delivered the opinion (?:of|for) (?:a|the) unanimous Court/i.test(text)) {
      majorityJoinedBy = JUSTICE_NAMES.map(justiceKey).filter((k) => k !== majorityAuthor);
    }
  } else if (/(?<!\()\bPER CURIAM\b(?!\))/i.test(text.slice(0, 8000))) {
    // Case-insensitive: the syllabus renders this as title-case "Per
    // Curiam" (only the actual opinion body, now excluded by the syllabus
    // scoping above, uses the all-caps "PER CURIAM." heading). Excludes a
    // parenthetical citation descriptor for the same reason as above.
    majorityAuthor = "per_curiam";
  }
  const majoritySet = majorityAuthor ? new Set([majorityAuthor]) : new Set<string>();

  // ── Concur/dissent (mixed) ───────────────────────────────────────────────
  // Checked FIRST and most specifically, since it must not be swallowed by
  // the looser plain-concurrence "concurr" fallback below — a justice who
  // "filed an opinion concurring in part and dissenting in part" is neither
  // a pure concurrence nor a pure dissent.
  const concurDissentMatches = scanOpinionClauses(
    text,
    String.raw`filed(?:\s+(?:a|an|the))?\s+opinions?\s+concurring[^.]{0,120}?dissenting`,
    majoritySet
  );
  const concurDissentAuthors = concurDissentMatches.map((m) => m.author);
  const concurDissentSet = new Set(concurDissentAuthors);

  // ── Concurrences ─────────────────────────────────────────────────────────
  // "KAVANAUGH, J., filed a concurring opinion" / "ALITO and GORSUCH, JJ.,
  // filed concurring opinions" / "...concurred in the judgment". Excludes
  // anyone already captured above as a concur/dissent.
  const concurrences = scanOpinionClauses(
    text,
    String.raw`filed(?:\s+(?:a|an|the))?\s+(?:concurring\s+opinions?|opinions?\s+concurring)|concurr`,
    new Set([...majoritySet, ...concurDissentSet])
  );
  const concurrenceAuthors = concurrences.map((m) => m.author);

  // ── Dissents ──────────────────────────────────────────────────────────────
  // "SOTOMAYOR, J., filed a dissenting opinion" / "ALITO and GORSUCH, JJ.,
  // filed dissenting opinions" (each separately). Excludes concur/dissent
  // authors, but NOT plain concurrence authors — dissent and concurrence
  // verb phrases don't overlap, so no cross-exclusion needed there.
  const dissents = scanOpinionClauses(
    text,
    String.raw`filed(?:\s+(?:a|an|the))?\s+(?:dissenting\s+opinions?|opinions?\s+dissenting)`,
    new Set([...majoritySet, ...concurDissentSet])
  );
  const dissentAuthors = dissents.map((m) => m.author);

  return {
    majorityAuthor,
    majorityJoinedBy,
    concurrenceAuthors,
    concurrences,
    dissentAuthors,
    dissents,
    concurDissentAuthors,
    concurDissents: concurDissentMatches,
  };
}

// ── Opinion summaries via Claude ──────────────────────────────────────────────

interface OpinionSummaries {
  majorityOpinionSummary: string;
  concurringSummaries: { author: string; summary: string }[];
  dissentSummaries: { author: string; summary: string }[];
  concurDissentSummaries: { author: string; summary: string }[];
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
  const concurDissentList = authors.concurDissentAuthors.join(", ") || "none";
  const majorityLabel = authors.majorityAuthor === "per_curiam"
    ? "per curiam (unsigned)"
    : authors.majorityAuthor ?? "unknown";

  const prompt = `You are summarizing a US Supreme Court opinion for a general audience. Write clearly for non-lawyers.

Case: ${caseTitle}
Majority author: ${majorityLabel}
Concurrence authors: ${concurrenceList}
Concur/dissent (concurring in part, dissenting in part) authors: ${concurDissentList}
Dissent authors: ${dissentList}

Return a JSON object with EXACTLY this structure (no other text):
{
  "majorityOpinionSummary": "2–3 paragraphs summarising the majority opinion: what the Court held, the key reasoning, and the practical effect. Plain English.",
  "concurringSummaries": [
    { "author": "justice_key_lowercase", "summary": "1–2 paragraphs summarising this justice's concurrence." }
  ],
  "concurDissentSummaries": [
    { "author": "justice_key_lowercase", "summary": "1–2 paragraphs summarising this justice's opinion concurring in part and dissenting in part." }
  ],
  "dissentSummaries": [
    { "author": "justice_key_lowercase", "summary": "1–2 paragraphs summarising this justice's dissent." }
  ]
}

Rules:
- Use the exact lowercase justice key (roberts, thomas, alito, sotomayor, kagan, gorsuch, kavanaugh, barrett, jackson, per_curiam) for author fields.
- Only include entries for justices listed above. If concurrenceList, concurDissentList, or dissentList is "none", return an empty array for that field.
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
      // Concur/dissent takes priority over a plain concurrence or dissent —
      // parseOpinionAuthors() already excludes concur/dissent authors from
      // both, this is defense-in-depth against any future caller that
      // doesn't. A justice can't simultaneously be a full dissenter and a
      // full concurrer, or either one AND a concur/dissent.
      const concurDissentSet = new Set(authors.concurDissentAuthors);
      const dissentSet = new Set(authors.dissentAuthors.filter((k) => !concurDissentSet.has(k)));
      const filteredConcurrences = authors.concurrenceAuthors.filter(
        (k) => !dissentSet.has(k) && !concurDissentSet.has(k)
      );
      const filteredConcurrenceJoins = authors.concurrences.filter(
        (c) => !dissentSet.has(c.author) && !concurDissentSet.has(c.author)
      );
      const filteredDissents = authors.dissents.filter((d) => !concurDissentSet.has(d.author));
      caseData.concurrenceAuthors = filteredConcurrences.length ? filteredConcurrences : undefined;
      caseData.concurDissentAuthors = authors.concurDissentAuthors.length ? authors.concurDissentAuthors : undefined;
      caseData.dissentAuthors = filteredDissents.length ? filteredDissents.map((d) => d.author) : undefined;
      caseData.petitionerWon = petitionerWon;
      caseData.majorityJoinedBy = authors.majorityJoinedBy.length ? authors.majorityJoinedBy : undefined;

      // Generate opinion summaries via Claude
      const effectiveAuthors: OpinionAuthors = {
        majorityAuthor: caseData.majorityAuthor ?? null,
        majorityJoinedBy: authors.majorityJoinedBy,
        concurrenceAuthors: filteredConcurrences,
        concurrences: filteredConcurrenceJoins,
        dissentAuthors: caseData.dissentAuthors ?? [],
        dissents: filteredDissents,
        concurDissentAuthors: authors.concurDissentAuthors,
        concurDissents: authors.concurDissents,
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
      caseData.concurDissentSummaries = summaries.concurDissentSummaries.length
        ? summaries.concurDissentSummaries.map((s) => {
            const match = effectiveAuthors.concurDissents.find((c) => c.author === s.author);
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
        `concurrences=[${filteredConcurrences.join(",")}] ` +
        `concurDissents=[${authors.concurDissentAuthors.join(",")}] ` +
        `dissents=[${(caseData.dissentAuthors ?? []).join(",")}] ` +
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

// Only auto-run when executed directly (`npx tsx scripts/fetch-opinion-authors.ts`),
// not when imported — parseOpinionAuthors() is imported by the regression
// test in scripts/test-opinion-classification.ts and must not trigger a
// live scrape as a side effect of that import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
