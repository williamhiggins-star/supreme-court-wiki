/**
 * compute-lawyer-stats.ts
 *
 * Downloads every 2025-term oral argument transcript PDF, parses each
 * speaker turn, and aggregates per-counsel speaking totals and case counts.
 * Saves results to data/lawyers.json.
 *
 * Run:  npx tsx scripts/compute-lawyer-stats.ts
 */

import * as fs from "fs";
import * as path from "path";
import { downloadPdf, extractText, CASES_DIR, DATA_DIR } from "./pipeline.js";

// ── Justice filter ────────────────────────────────────────────────────────────

const JUSTICE_KEYS = [
  "ROBERTS", "THOMAS", "ALITO", "SOTOMAYOR", "KAGAN",
  "GORSUCH", "KAVANAUGH", "BARRETT", "JACKSON",
];

function isJustice(label: string): boolean {
  const up = label.toUpperCase();
  return JUSTICE_KEYS.some((k) => up.includes(k)) || up.includes("CHIEF JUSTICE");
}

// Structural / reporter labels that appear in transcript formatting but are
// not actual speakers.
const NOISE_SUBSTRINGS = [
  "APPEARANCES",
  "ORAL ARGUMENT OF",
  "REBUTTAL ARGUMENT OF",
  "REPORTING CORPORATION",
  "REPORTING CO",
  "HERITAGE",
  "OFFICIAL",
  "SUBJECT TO FINAL REVIEW",
];

function isNoisy(label: string): boolean {
  const up = label.toUpperCase();
  return NOISE_SUBSTRINGS.some((s) => up.includes(s));
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function normalizeLabel(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

/** "MR. TRIPP" → "Mr. Tripp", "GENERAL PRELOGAR" → "General Prelogar" */
function displayName(label: string): string {
  return label
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.endsWith(".")) {
        // Honorific abbreviation: "MR." → "Mr."
        return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// ── Side detection ────────────────────────────────────────────────────────────

/**
 * Parses the APPEARANCES block to build a LAST_NAME → side map.
 * Entries look like:
 *   PAUL D. CLEMENT, ESQUIRE, ...; on behalf of the Petitioners.
 *   JANE E. NOTZ, Solicitor General, ...; on behalf of the Respondents.
 */
function parseAppearanceSides(text: string): Map<string, "petitioner" | "respondent"> {
  const map = new Map<string, "petitioner" | "respondent">();
  const appearsIdx = text.search(/\bAPPEARANCES\b/i);
  if (appearsIdx === -1) return map;

  const section = text.slice(appearsIdx, appearsIdx + 3000);
  const lines = section.split("\n").map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Line starts with an all-caps name followed by a comma
    const nameMatch = /^([A-Z\u00C0-\u024F][A-Z\u00C0-\u024F .]{3,}?),/.exec(line);
    if (!nameMatch) continue;

    const words = nameMatch[1].trim().split(/\s+/);
    const lastName = words[words.length - 1]
      .replace(/[^A-Z\u00C0-\u024F]/gi, "")
      .toUpperCase();
    if (lastName.length < 2) continue;

    // Check this line + next 4 lines for "petitioner" or "respondent"
    const window = lines.slice(i, i + 5).join(" ");
    if (/petitioner/i.test(window))      map.set(lastName, "petitioner");
    else if (/respondent/i.test(window)) map.set(lastName, "respondent");
  }
  return map;
}

/**
 * Returns a map of normalized turn label → side, keyed the same way as the
 * stats Record (e.g. "MR. CLEMENT" → "petitioner").
 * Connects turn labels to sides via last-name matching against APPEARANCES.
 */
function parseSides(text: string): Map<string, "petitioner" | "respondent"> {
  const lastNameSide = parseAppearanceSides(text);
  const sides = new Map<string, "petitioner" | "respondent">();

  const speakerRe =
    /(?:^|\n) {0,8}([A-Z\u00C0-\u024F][A-Z\u00C0-\u024F .,']+?):\s+/g;
  let m: RegExpExecArray | null;
  while ((m = speakerRe.exec(text)) !== null) {
    const label = normalizeLabel(m[1]);
    if (isJustice(label) || isNoisy(label)) continue;
    const words = label.split(/\s+/);
    const lastName = words[words.length - 1]
      .replace(/[^A-Z\u00C0-\u024F]/gi, "")
      .toUpperCase();
    const side = lastNameSide.get(lastName);
    if (side && !sides.has(label)) sides.set(label, side);
  }
  return sides;
}

// ── Transcript parser ─────────────────────────────────────────────────────────

interface Turn {
  label: string; // normalized
  words: number;
}

function parseCounselTurns(rawText: string): Turn[] {
  // Strip trailing word-concordance index (same fix as justice stats)
  const whereupRe = /\(Whereupon[^)]{0,120}(?:submitted|concluded)[^)]{0,80}\)/i;
  const whereupMatch = whereupRe.exec(rawText);
  const text = whereupMatch
    ? rawText.slice(0, whereupMatch.index + whereupMatch[0].length)
    : rawText;

  // Match ALL speaker labels — extend char class to cover accented names (Ñ etc.)
  const speakerRe =
    /(?:^|\n) {0,8}([A-Z\u00C0-\u024F][A-Z\u00C0-\u024F .,']+?):\s+/g;

  interface RawMatch { pos: number; contentStart: number; label: string }
  const allMatches: RawMatch[] = [];
  let m: RegExpExecArray | null;

  while ((m = speakerRe.exec(text)) !== null) {
    const label = m[1].trim();
    if (label.length < 2 || /\d/.test(label)) continue;
    allMatches.push({ pos: m.index, contentStart: m.index + m[0].length, label });
  }

  const turns: Turn[] = [];
  for (let i = 0; i < allMatches.length; i++) {
    const label = normalizeLabel(allMatches[i].label);

    if (isJustice(label)) continue;
    if (isNoisy(label)) continue;

    const start = allMatches[i].contentStart;
    const end = i + 1 < allMatches.length ? allMatches[i + 1].pos : text.length;
    const content = text.slice(start, end).trim();
    const words = content.split(/\s+/).filter((w) => w.length > 0).length;

    // Skip extremely short bursts — likely false matches
    if (words < 5) continue;

    turns.push({ label, words });
  }

  return turns;
}

// ── Data structures ───────────────────────────────────────────────────────────

export interface LawyerCase {
  slug: string;
  caseNumber: string;
  title: string;
  side?: "petitioner" | "respondent";
  outcome?: "won" | "lost" | "pending";
  majorityAuthor?: string;
  concurrenceAuthors?: string[];
  dissentAuthors?: string[];
}

export interface LawyerStat {
  label: string;
  name: string;
  totalWords: number;
  estimatedMinutes: number;
  casesArgued: number;
  wins: number;
  losses: number;
  cases: LawyerCase[];
}

export interface LawyersData {
  term: string;
  generated: string;
  lawyers: LawyerStat[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const caseFiles = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));

  // Map from filename → case metadata (including sides and outcomes)
  const caseMetaByFile: Record<string, {
    slug: string; caseNumber: string; title: string;
    petitionerWon: boolean | null;
    majorityAuthor?: string; concurrenceAuthors?: string[]; dissentAuthors?: string[];
  }> = {};

  // Map: filename → label → side (petitioner/respondent)
  const sidsByFile: Record<string, Map<string, "petitioner" | "respondent">> = {};

  const stats: Record<string, { totalWords: number; cases: Set<string> }> = {};

  let processed = 0;
  let skipped = 0;

  for (const file of caseFiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caseData: any = JSON.parse(
      fs.readFileSync(path.join(CASES_DIR, file), "utf-8")
    );

    if (caseData.termYear !== "2025") { skipped++; continue; }
    const url: string = caseData.transcriptUrl ?? "";
    if (!url.endsWith(".pdf")) { skipped++; continue; }

    caseMetaByFile[file] = {
      slug: caseData.slug,
      caseNumber: caseData.caseNumber,
      title: caseData.title,
      petitionerWon: caseData.petitionerWon ?? null,
      majorityAuthor: caseData.majorityAuthor,
      concurrenceAuthors: caseData.concurrenceAuthors,
      dissentAuthors: caseData.dissentAuthors,
    };

    console.log(`Processing ${caseData.caseNumber} — ${caseData.title}`);

    try {
      const buf = await downloadPdf(url);
      const text = await extractText(buf);
      const turns = parseCounselTurns(text);
      const sides = parseSides(text);
      sidsByFile[file] = sides;

      for (const { label, words } of turns) {
        if (!stats[label]) stats[label] = { totalWords: 0, cases: new Set() };
        stats[label].totalWords += words;
        stats[label].cases.add(file);
      }
      processed++;
    } catch (err) {
      console.warn(`  ✗ ${caseData.caseNumber}: ${err}`);
    }
  }

  const WPM = 130;

  function resolveOutcome(
    side: "petitioner" | "respondent" | undefined,
    petitionerWon: boolean | null
  ): "won" | "lost" | "pending" {
    if (petitionerWon === null || petitionerWon === undefined || !side) return "pending";
    if (side === "petitioner") return petitionerWon ? "won" : "lost";
    return petitionerWon ? "lost" : "won";
  }

  const lawyers: LawyerStat[] = Object.entries(stats)
    .map(([label, { totalWords, cases }]) => {
      const caseList: LawyerCase[] = [...cases]
        .map((file) => {
          const meta = caseMetaByFile[file];
          if (!meta) return null;
          const side = sidsByFile[file]?.get(label);
          const outcome = resolveOutcome(side, meta.petitionerWon);
          const entry: LawyerCase = {
            slug: meta.slug,
            caseNumber: meta.caseNumber,
            title: meta.title,
          };
          if (side) entry.side = side;
          entry.outcome = outcome;
          if (meta.majorityAuthor) entry.majorityAuthor = meta.majorityAuthor;
          if (meta.concurrenceAuthors?.length) entry.concurrenceAuthors = meta.concurrenceAuthors;
          if (meta.dissentAuthors?.length) entry.dissentAuthors = meta.dissentAuthors;
          return entry;
        })
        .filter((e): e is LawyerCase => e !== null)
        .sort((a, b) => a.caseNumber.localeCompare(b.caseNumber));

      const wins   = caseList.filter((c) => c.outcome === "won").length;
      const losses = caseList.filter((c) => c.outcome === "lost").length;

      return {
        label,
        name: displayName(label),
        totalWords,
        estimatedMinutes: Math.round((totalWords / WPM) * 10) / 10,
        casesArgued: cases.size,
        wins,
        losses,
        cases: caseList,
      };
    })
    .filter((l) => l.totalWords >= 100) // drop noise with < 1 min total
    .sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);

  const output: LawyersData = {
    term: "2025",
    generated: new Date().toISOString().split("T")[0],
    lawyers,
  };

  const outPath = path.join(DATA_DIR, "lawyers.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\n✓ Processed ${processed} transcripts, skipped ${skipped}`);
  console.log(`✓ ${lawyers.length} counsel tracked → ${outPath}`);
  console.log("\nTop speakers:");
  lawyers.slice(0, 10).forEach((l) =>
    console.log(`  ${l.name}: ${l.estimatedMinutes} min, ${l.casesArgued} case(s)`)
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
