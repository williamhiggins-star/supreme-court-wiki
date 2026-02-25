/**
 * One-off retry for 24-872 Hamm v. Smith with 80K char limit
 * and non-streaming API call to avoid stream termination.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  downloadPdf,
  extractText,
  buildResult,
  saveResult,
  ensureDataDirs,
  CASES_DIR,
} from "./pipeline.js";
import * as fs from "fs";

async function main() {
  ensureDataDirs();

  const url =
    "https://www.supremecourt.gov/oral_arguments/argument_transcripts/2025/24-872_b07d.pdf";
  const caseNumber = "24-872";
  const termYear = "2025";

  const existing = fs
    .readdirSync(CASES_DIR)
    .find((f) => f.startsWith("24-872"));
  if (existing) {
    console.log(`Already processed: ${existing}`);
    return;
  }

  console.log("Downloading...");
  const buf = await downloadPdf(url);
  console.log(`Downloaded ${(buf.length / 1024).toFixed(1)} KB`);

  console.log("Extracting text...");
  const fullText = await extractText(buf);
  const MAX_CHARS = 80_000;
  console.log(`Extracted ${fullText.length} chars — trimming to ${MAX_CHARS}`);
  const text =
    fullText.slice(0, MAX_CHARS) +
    "\n\n[TRANSCRIPT TRIMMED — first portion shown]";

  const client = new Anthropic();

  const SYSTEM = `You are a legal expert who makes US Supreme Court oral arguments accessible to non-lawyers.
When given a transcript, you extract and explain all key information in plain English without sacrificing accuracy.
You always respond with valid JSON matching the exact schema provided. Do not include any text outside the JSON object.`;

  const USER = `Analyze this US Supreme Court oral argument transcript and return a JSON object with EXACTLY this structure.
Be concise — stay within the field length guidance below.

{
  "title": "Short case name, e.g. 'Smith v. Jones'",
  "argumentDate": "YYYY-MM-DD",
  "legalQuestion": "One sentence: the core legal question before the Court",
  "backgroundAndFacts": "2-3 paragraphs in plain English for a non-lawyer",
  "significance": "1-2 paragraphs: why this case matters",
  "parties": [
    {
      "party": "Party name",
      "role": "petitioner | respondent | amicus",
      "coreArgument": "2-3 sentences summarizing their position",
      "supportingPoints": ["Up to 4 key points — be brief"],
      "keyExchanges": [
        {
          "justice": "Justice Name",
          "question": "What the justice asked (1-2 sentences)",
          "context": "Why it matters (1 sentence)",
          "significance": "What it revealed (1 sentence)"
        }
      ]
    }
  ],
  "citedPrecedents": [
    {
      "caseName": "Full case name",
      "citation": "e.g. '410 U.S. 113' — omit if not stated",
      "year": 1973,
      "reasonCited": "1-2 sentences: why it was cited here",
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
- Include at most 3 keyExchanges per party (the most revealing ones only)
- Include at most 8 citedPrecedents (the most significant ones)
- Include at most 10 legalTerms
- Return only the JSON object, no other text

Case number: ${caseNumber}
Term year: ${termYear}

TRANSCRIPT:
${text}`;

  console.log("Calling API (claude-sonnet-4-6, non-streaming)...");
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: USER }],
  });

  console.log(
    `Done. Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`
  );

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text")
    throw new Error("No text in response");

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    throw new Error("No JSON in response: " + textBlock.text.slice(0, 200));

  const raw = JSON.parse(jsonMatch[0]);
  const result = buildResult(raw, caseNumber, termYear, url, "petition");
  saveResult(result);
  console.log("Saved:", result.case.title);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
