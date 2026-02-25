/**
 * compute-justice-stats.ts
 *
 * Downloads every 2025-term oral argument transcript PDF, parses each
 * speaker turn, and aggregates per-justice question counts and word totals.
 * Saves results to data/justices.json.
 *
 * Run:  npx tsx scripts/compute-justice-stats.ts
 */

import * as fs from "fs";
import * as path from "path";
import { downloadPdf, extractText, CASES_DIR, DATA_DIR } from "./pipeline.js";

// ── Justice registry ─────────────────────────────────────────────────────────

interface JusticeMeta {
  key: string;
  displayName: string;
  photo: string;
}

const JUSTICES: JusticeMeta[] = [
  { key: "roberts",   displayName: "Chief Justice Roberts", photo: "/images/justices/roberts.jpg"   },
  { key: "thomas",    displayName: "Justice Thomas",        photo: "/images/justices/thomas.jpg"    },
  { key: "alito",     displayName: "Justice Alito",         photo: "/images/justices/alito.jpg"     },
  { key: "sotomayor", displayName: "Justice Sotomayor",     photo: "/images/justices/sotomayor.jpg" },
  { key: "kagan",     displayName: "Justice Kagan",         photo: "/images/justices/kagan.jpg"     },
  { key: "gorsuch",   displayName: "Justice Gorsuch",       photo: "/images/justices/gorsuch.jpg"   },
  { key: "kavanaugh", displayName: "Justice Kavanaugh",     photo: "/images/justices/kavanaugh.jpg" },
  { key: "barrett",   displayName: "Justice Barrett",       photo: "/images/justices/barrett.jpg"   },
  { key: "jackson",   displayName: "Justice Jackson",       photo: "/images/justices/jackson.jpg"   },
];

// Regex: matches speaker label at start of a turn
// e.g. "CHIEF JUSTICE ROBERTS:", "JUSTICE KAGAN:", "JUSTICE BARRETT:"
const SPEAKER_RE =
  /\b(CHIEF JUSTICE ROBERTS|JUSTICE (?:THOMAS|ALITO|SOTOMAYOR|KAGAN|GORSUCH|KAVANAUGH|BARRETT|JACKSON))\s*:/g;

function justiceKeyFromLabel(label: string): string | null {
  const up = label.toUpperCase();
  if (up.includes("ROBERTS"))   return "roberts";
  if (up.includes("THOMAS"))    return "thomas";
  if (up.includes("ALITO"))     return "alito";
  if (up.includes("SOTOMAYOR")) return "sotomayor";
  if (up.includes("KAGAN"))     return "kagan";
  if (up.includes("GORSUCH"))   return "gorsuch";
  if (up.includes("KAVANAUGH")) return "kavanaugh";
  if (up.includes("BARRETT"))   return "barrett";
  if (up.includes("JACKSON"))   return "jackson";
  return null;
}

// ── Transcript parser ─────────────────────────────────────────────────────────

interface Turn {
  key: string;
  words: number;
}

function parseTranscript(rawText: string): Turn[] {
  // Strip everything from the "(Whereupon, ... submitted/concluded)" marker
  // onward.  Every SCOTUS transcript PDF ends with a multi-page word-
  // concordance index; without this trim it inflates the last justice's
  // (usually Roberts') word count by ~8,000–10,000 words per case.
  const whereupRe = /\(Whereupon[^)]{0,120}(?:submitted|concluded)[^)]{0,80}\)/i;
  const whereupMatch = whereupRe.exec(rawText);
  const text = whereupMatch
    ? rawText.slice(0, whereupMatch.index + whereupMatch[0].length)
    : rawText;

  // Detect ALL speaker turns (justices AND counsel) so that each justice's
  // word count stops when the next speaker — anyone — begins.
  //
  // SCOTUS transcript format:
  //   "   JUSTICE KAGAN:  text..."
  //   "   MR. BECK:  text..."
  //
  // We match: optional whitespace, ALL-CAPS name (letters/spaces/dots/commas),
  // colon, whitespace.  Then only count words for justice turns.

  const speakerRe = /(?:^|\n) {0,8}([A-Z][A-Z .,']+?):\s+/g;

  interface RawMatch { pos: number; contentStart: number; label: string }
  const allMatches: RawMatch[] = [];
  let m: RegExpExecArray | null;

  while ((m = speakerRe.exec(text)) !== null) {
    const label = m[1].trim();
    if (label.length < 2 || /\d/.test(label)) continue; // skip garbage
    allMatches.push({ pos: m.index, contentStart: m.index + m[0].length, label });
  }

  const turns: Turn[] = [];
  for (let i = 0; i < allMatches.length; i++) {
    const key = justiceKeyFromLabel(allMatches[i].label);
    if (!key) continue; // counsel or other non-justice speaker

    const start = allMatches[i].contentStart;
    // End at the START of the next speaker's line (any speaker)
    const end = i + 1 < allMatches.length ? allMatches[i + 1].pos : text.length;
    const content = text.slice(start, end).trim();
    const words = content.split(/\s+/).filter((w) => w.length > 0).length;
    turns.push({ key, words });
  }

  return turns;
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface JusticeStat {
  key: string;
  displayName: string;
  photo: string;
  questions: number;        // number of speaking turns
  totalWords: number;
  estimatedMinutes: number; // totalWords / 130 wpm
  casesParticipated: number;
  majorityOpinions: number;
  concurrences: number;
  dissents: number;
}

export interface JusticesData {
  term: string;
  generated: string;
  justices: JusticeStat[];
}

async function main() {
  const caseFiles = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));

  // Accumulate per-justice stats
  const stats: Record<string, {
    questions: number; totalWords: number; cases: Set<string>;
    majorityOpinions: number; concurrences: number; dissents: number;
  }> = {};
  for (const j of JUSTICES) {
    stats[j.key] = { questions: 0, totalWords: 0, cases: new Set(), majorityOpinions: 0, concurrences: 0, dissents: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const file of caseFiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caseData: any = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), "utf-8"));

    // Only process 2025 term cases with actual transcript PDFs
    if (caseData.termYear !== "2025") { skipped++; continue; }
    const url: string = caseData.transcriptUrl ?? "";
    if (!url.endsWith(".pdf")) { skipped++; continue; }

    console.log(`Processing ${caseData.caseNumber} — ${caseData.title}`);

    try {
      const buf = await downloadPdf(url);
      const text = await extractText(buf);
      const turns = parseTranscript(text);

      for (const { key, words } of turns) {
        stats[key].questions++;
        stats[key].totalWords += words;
        stats[key].cases.add(file);
      }
      processed++;
    } catch (err) {
      console.warn(`  ✗ ${caseData.caseNumber}: ${err}`);
    }
  }

  // Tally opinion authorship from decided 2025-term case files
  for (const file of caseFiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caseData: any = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), "utf-8"));
    if (caseData.termYear !== "2025") continue;
    if (caseData.docketStatus !== "decided") continue;

    const { majorityAuthor, concurrenceAuthors = [], dissentAuthors = [] } = caseData;
    if (majorityAuthor && stats[majorityAuthor]) stats[majorityAuthor].majorityOpinions++;
    for (const k of concurrenceAuthors) if (stats[k]) stats[k].concurrences++;
    for (const k of dissentAuthors)    if (stats[k]) stats[k].dissents++;
  }

  // Build output
  const WPM = 130; // average speaking rate
  const justices: JusticeStat[] = JUSTICES.map((j) => ({
    key: j.key,
    displayName: j.displayName,
    photo: j.photo,
    questions: stats[j.key].questions,
    totalWords: stats[j.key].totalWords,
    estimatedMinutes: Math.round((stats[j.key].totalWords / WPM) * 10) / 10,
    casesParticipated: stats[j.key].cases.size,
    majorityOpinions: stats[j.key].majorityOpinions,
    concurrences: stats[j.key].concurrences,
    dissents: stats[j.key].dissents,
  })).sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);

  const output: JusticesData = {
    term: "2025",
    generated: new Date().toISOString().split("T")[0],
    justices,
  };

  const outPath = path.join(DATA_DIR, "justices.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\n✓ Processed ${processed} transcripts, skipped ${skipped}`);
  console.log(`✓ Saved to ${outPath}`);
  console.log("\nTop speakers:");
  justices.slice(0, 5).forEach((j) =>
    console.log(`  ${j.displayName}: ${j.estimatedMinutes} min, ${j.questions} questions`)
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
