#!/usr/bin/env tsx
/**
 * process-upcoming.ts
 *
 * Creates a case page for an upcoming Supreme Court oral argument
 * using SCOTUS docket information and web research (no transcript yet).
 *
 * Usage:
 *   npx tsx scripts/process-upcoming.ts <case-number> <argument-date> [term-year]
 *
 * Example:
 *   npx tsx scripts/process-upcoming.ts "25-95" "2026-02-25" "2025"
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import {
  buildResult,
  saveResult,
  ensureDataDirs,
  existingSlugForCaseNumber,
  getExistingCaseSlugs,
  CASES_DIR,
} from "./pipeline.js";
import type { RawAIOutput } from "./pipeline.js";

const SCOTUS_DOCKET_BASE =
  "https://www.supremecourt.gov/docket/docketfiles/html/public";

async function fetchDocketPage(caseNumber: string): Promise<string> {
  const url = `${SCOTUS_DOCKET_BASE}/${caseNumber}.html`;
  console.log(`Fetching docket: ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`Docket fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  // Strip HTML tags and collapse whitespace for readability
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 20_000);
}

const SYSTEM_PROMPT = `You are a legal expert who makes US Supreme Court cases accessible to non-lawyers.
You have been given docket information and background about a case that has been accepted for oral argument but not yet argued.
Generate a structured case summary based on the available information from petitions and briefs.
You always respond with valid JSON matching the exact schema provided. Do not include any text outside the JSON object.`;

function buildPrompt(
  caseNumber: string,
  caseName: string,
  argumentDate: string,
  termYear: string,
  docketText: string
): string {
  return `Analyze this upcoming Supreme Court case and return a JSON object with EXACTLY this structure.
The oral argument has NOT yet occurred — base party positions on the written petitions and briefs.
Leave keyExchanges as an empty array for all parties.

{
  "title": "Short case name, e.g. 'Smith v. Jones'",
  "argumentDate": "${argumentDate}",
  "legalQuestion": "One sentence: the core legal question before the Court",
  "backgroundAndFacts": "2-3 paragraphs in plain English for a non-lawyer explaining the facts and lower court history",
  "significance": "1-2 paragraphs: why this case matters and what the Court's decision could mean",
  "parties": [
    {
      "party": "Party name",
      "role": "petitioner | respondent | amicus",
      "coreArgument": "2-3 sentences summarizing their written position",
      "supportingPoints": ["Up to 4 key points from their briefs — be brief"],
      "keyExchanges": []
    }
  ],
  "citedPrecedents": [
    {
      "caseName": "Full case name",
      "citation": "e.g. '410 U.S. 113' — omit if not known",
      "year": 1973,
      "reasonCited": "1-2 sentences: why it is relevant to this case",
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
- keyExchanges MUST be [] for every party (argument has not occurred)
- Include at most 2 parties (petitioner and respondent; omit amicus unless very significant)
- Include at most 6 citedPrecedents (the most relevant ones)
- Include at most 8 legalTerms
- Return only the JSON object, no other text

Case number: ${caseNumber}
Case name: ${caseName}
Scheduled argument: ${argumentDate} at 10:00 a.m. ET
Term year: ${termYear}

DOCKET INFORMATION:
${docketText}`;
}

async function main() {
  const [, , caseNumber, argumentDate, termYear = "2025"] = process.argv;

  if (!caseNumber || !argumentDate) {
    console.error(
      "Usage: npx tsx scripts/process-upcoming.ts <case-number> <argument-date> [term-year]"
    );
    console.error("  Example: npx tsx scripts/process-upcoming.ts 25-95 2026-02-25 2025");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  ensureDataDirs();

  const existing = existingSlugForCaseNumber(caseNumber, getExistingCaseSlugs());
  if (existing) {
    console.log(`Already exists: ${existing} — skipping`);
    return;
  }

  // 1. Fetch docket page
  const docketText = await fetchDocketPage(caseNumber);

  // Extract case name from docket (first meaningful title-like text)
  // We'll pass it as a placeholder; Claude will derive the real name
  const caseName = caseNumber;

  // 2. Call Claude (non-streaming, no adaptive thinking — keeps it fast)
  const client = new Anthropic();
  console.log("Calling Anthropic API...");

  const model = process.env.MODEL ?? "claude-sonnet-4-6";
  const messageParams = {
    model,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: buildPrompt(caseNumber, caseName, argumentDate, termYear, docketText),
      },
    ],
  };

  let response;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      response = await client.messages.create(messageParams);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 5 && msg.toLowerCase().includes("overload")) {
        const wait = attempt * 30;
        console.log(`API overloaded — waiting ${wait}s (attempt ${attempt}/5)...`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      } else {
        throw err;
      }
    }
  }
  if (!response) throw new Error("No response after retries");

  console.log(
    `Done. Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`
  );

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text")
    throw new Error("No text in response");

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    throw new Error("No JSON in response:\n" + textBlock.text.slice(0, 300));

  const raw = JSON.parse(jsonMatch[0]) as RawAIOutput;

  // Use docket page URL as transcriptUrl placeholder for upcoming cases
  const docketUrl = `${SCOTUS_DOCKET_BASE}/${caseNumber}.html`;
  const result = buildResult(raw, caseNumber, termYear, docketUrl, "upcoming");

  saveResult(result);
  console.log(`\nSaved: ${result.case.title} → ${result.case.slug}.json`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
