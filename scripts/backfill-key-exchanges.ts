#!/usr/bin/env tsx
/**
 * backfill-key-exchanges.ts
 *
 * Idempotent one-time script to populate keyExchanges for argued cases that
 * were originally created as "upcoming" stubs and never had their transcript
 * processed (because promoteArguedCases flips the status before the transcript
 * pipeline can pick them up).
 *
 * Safe to re-run — skips any case that already has keyExchanges.
 *
 * Run: npx tsx scripts/backfill-key-exchanges.ts
 * Requires: ANTHROPIC_API_KEY in .env.local (or env)
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import {
  downloadPdf,
  extractText,
  withRetry,
  getExistingCaseSlugs,
  CASES_DIR,
} from "./pipeline.js";
import type { CaseSummary } from "../src/types/index.js";

// ── Load .env.local ──────────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* rely on process.env */ }
}
loadEnvLocal();

// ── Constants ────────────────────────────────────────────────────────────────

const SCOTUS_BASE = "https://www.supremecourt.gov";
const USER_AGENT = "Mozilla/5.0 (compatible; SupremeCourtWiki/1.0)";

function currentTermYear(): string {
  const now = new Date();
  return now.getMonth() >= 9 ? String(now.getFullYear()) : String(now.getFullYear() - 1);
}

// ── Fetch transcript list from SCOTUS ────────────────────────────────────────

interface TranscriptEntry {
  caseNumber: string;
  transcriptUrl: string;
}

async function fetchTranscriptList(termYear: string): Promise<TranscriptEntry[]> {
  const url = `${SCOTUS_BASE}/oral_arguments/argument_transcripts/${termYear}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();

  const pattern =
    /href="(\/oral_arguments\/argument_transcripts\/\d{4}\/([^"_/]+)[^"]*\.pdf)"/gi;
  const seen = new Set<string>();
  const results: TranscriptEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const caseNumber = match[2];
    if (seen.has(caseNumber)) continue;
    seen.add(caseNumber);
    results.push({ caseNumber, transcriptUrl: `${SCOTUS_BASE}${match[1]}` });
  }
  return results;
}

// ── Claude prompt (key exchanges only) ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a legal expert analyzing Supreme Court oral argument transcripts.
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
- Include at most 3 keyExchanges per party — choose the most revealing ones only
- Match "party" exactly to one of these names: ${parties.map((p) => `"${p}"`).join(", ")}
- Return ONLY the JSON object, no other text

TRANSCRIPT:
${trimmed}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY not set.");
    process.exit(1);
  }

  const client = new Anthropic();
  const termYear = currentTermYear();
  console.log(`\n=== Backfilling key exchanges — term ${termYear} ===\n`);

  // Find argued cases with no key exchanges
  const slugs = getExistingCaseSlugs();
  const needsBackfill: Array<{ slug: string; caseNumber: string; title: string }> = [];

  for (const slug of slugs) {
    const filePath = path.join(CASES_DIR, `${slug}.json`);
    let c: CaseSummary;
    try {
      c = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CaseSummary;
    } catch {
      continue;
    }
    // Only argued (petition) or decided cases can have transcripts
    if (c.docketStatus !== "petition" && c.docketStatus !== "decided") continue;
    const hasExchanges = c.parties.some(
      (p) => p.keyExchanges && p.keyExchanges.length > 0
    );
    if (hasExchanges) continue;
    needsBackfill.push({ slug, caseNumber: c.caseNumber, title: c.title });
  }

  if (needsBackfill.length === 0) {
    console.log("✅ All argued/decided cases already have key exchanges.");
    return;
  }

  console.log(`Found ${needsBackfill.length} case(s) to backfill:`);
  needsBackfill.forEach((c) => console.log(`  - ${c.caseNumber}  ${c.title}`));

  // Fetch transcript list
  console.log(`\nFetching transcript list for ${termYear} term...`);
  const transcripts = await fetchTranscriptList(termYear);
  console.log(`  ${transcripts.length} transcripts available.`);
  const transcriptMap = new Map(transcripts.map((t) => [t.caseNumber, t.transcriptUrl]));

  let filled = 0;
  let skipped = 0;

  for (const { slug, caseNumber, title } of needsBackfill) {
    const transcriptUrl = transcriptMap.get(caseNumber);
    if (!transcriptUrl) {
      console.log(`\n⚠️  ${title} — transcript not yet published, skipping.`);
      skipped++;
      continue;
    }

    console.log(`\n📄 ${title} (${caseNumber})`);
    console.log(`   Transcript: ${transcriptUrl}`);

    try {
      const pdfBuffer = await downloadPdf(transcriptUrl);
      console.log(`   Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

      const text = await extractText(pdfBuffer);
      console.log(`   Extracted ${text.length.toLocaleString()} chars`);

      const filePath = path.join(CASES_DIR, `${slug}.json`);
      const caseData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CaseSummary;
      const partyNames = caseData.parties.map((p) => p.party);

      const model = process.env.MODEL ?? "claude-opus-4-6";
      console.log(`   Calling Claude (${model})...`);

      const response = await withRetry(() =>
        client.messages.create({
          model,
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildKeyExchangesPrompt(text, partyNames),
            },
          ],
        })
      );

      const textBlock = (
        response.content as Array<{ type: string; text?: string }>
      ).find((b) => b.type === "text");
      if (!textBlock?.text) throw new Error("No text in response");

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response:\n" + textBlock.text.slice(0, 300));

      const result = JSON.parse(jsonMatch[0]) as {
        parties: Array<{
          party: string;
          keyExchanges: CaseSummary["parties"][number]["keyExchanges"];
        }>;
      };

      // Patch keyExchanges into the existing case file (preserving all other fields)
      for (const resultParty of result.parties) {
        const existing = caseData.parties.find((p) => p.party === resultParty.party);
        if (existing) {
          existing.keyExchanges = resultParty.keyExchanges;
        }
      }

      // Also update transcriptUrl to the PDF (was pointing at docket page)
      if (!caseData.transcriptUrl.endsWith(".pdf")) {
        caseData.transcriptUrl = transcriptUrl;
      }

      fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2) + "\n");

      const counts = result.parties.map((p) => p.keyExchanges.length).join(", ");
      console.log(`   ✅ Added key exchanges (${counts} per party)`);
      filled++;
    } catch (err) {
      console.error(`   ❌ Error: ${err}`);
    }
  }

  console.log(
    `\n✔ Done. ${filled} backfilled, ${skipped} skipped (no transcript yet).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
