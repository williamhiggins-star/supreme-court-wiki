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
}

export interface LawyerStat {
  label: string;
  name: string;
  totalWords: number;
  estimatedMinutes: number;
  casesArgued: number;
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

  // Map from filename → case metadata so we can embed it later
  const caseMetaByFile: Record<string, { slug: string; caseNumber: string; title: string }> = {};

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
    };

    console.log(`Processing ${caseData.caseNumber} — ${caseData.title}`);

    try {
      const buf = await downloadPdf(url);
      const text = await extractText(buf);
      const turns = parseCounselTurns(text);

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
  const lawyers: LawyerStat[] = Object.entries(stats)
    .map(([label, { totalWords, cases }]) => ({
      label,
      name: displayName(label),
      totalWords,
      estimatedMinutes: Math.round((totalWords / WPM) * 10) / 10,
      casesArgued: cases.size,
      cases: [...cases]
        .map((file) => caseMetaByFile[file])
        .filter(Boolean)
        .sort((a, b) => a.caseNumber.localeCompare(b.caseNumber)),
    }))
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
