/**
 * pipeline.ts
 *
 * Shared helpers for downloading, parsing, and processing Supreme Court
 * oral argument transcripts via the Anthropic API.
 *
 * Used by both process-transcript.ts (manual CLI) and update-cases.ts (automated).
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { PDFParse } from "pdf-parse";
import type {
  CaseSummary,
  LegalTerm,
  PrecedentCase,
  ProcessingResult,
} from "../src/types/index.js";

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

export const DATA_DIR = path.join(process.cwd(), "data");
export const CASES_DIR = path.join(DATA_DIR, "cases");
export const TERMS_DIR = path.join(DATA_DIR, "terms");
export const PRECEDENTS_DIR = path.join(DATA_DIR, "precedents");

export function ensureDataDirs(): void {
  for (const dir of [CASES_DIR, TERMS_DIR, PRECEDENTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// PDF Download
// ---------------------------------------------------------------------------

export async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/pdf,*/*",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Text Extraction
// ---------------------------------------------------------------------------

export async function extractText(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  return result.text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Slug Helpers
// ---------------------------------------------------------------------------

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// ---------------------------------------------------------------------------
// Existing slugs
// ---------------------------------------------------------------------------

export function getExistingCaseSlugs(): Set<string> {
  try {
    return new Set(
      fs
        .readdirSync(CASES_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
    );
  } catch {
    return new Set();
  }
}

export function caseNumberToSlugPrefix(caseNumber: string): string {
  // e.g. "23-411" → used to match "23-411-smith-v-jones"
  return toSlug(caseNumber);
}

export function existingSlugForCaseNumber(
  caseNumber: string,
  slugs: Set<string>
): string | undefined {
  const prefix = caseNumberToSlugPrefix(caseNumber);
  return [...slugs].find((s) => s.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Anthropic Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a legal expert who makes US Supreme Court oral arguments accessible to non-lawyers.
When given a transcript, you extract and explain all key information in plain English without sacrificing accuracy.
You always respond with valid JSON matching the exact schema provided. Do not include any text outside the JSON object.`;

function buildUserPrompt(
  transcriptText: string,
  caseNumber: string,
  termYear: string
): string {
  const MAX_CHARS = 150_000;
  const trimmed =
    transcriptText.length > MAX_CHARS
      ? transcriptText.slice(0, MAX_CHARS) +
        "\n\n[TRANSCRIPT TRIMMED — first ~60% shown]"
      : transcriptText;

  return `Analyze this US Supreme Court oral argument transcript and return a JSON object with EXACTLY this structure.
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
- Do NOT include backgroundAndFacts/holding/voteCount for cited precedents — those are generated separately
- Return only the JSON object, no other text

Case number: ${caseNumber}
Term year: ${termYear}

TRANSCRIPT:
${trimmed}`;
}

// ---------------------------------------------------------------------------
// Raw AI output type
// ---------------------------------------------------------------------------

export interface RawAIOutput {
  title: string;
  argumentDate: string;
  legalQuestion: string;
  backgroundAndFacts: string;
  significance: string;
  parties: Array<{
    party: string;
    role: string;
    coreArgument: string;
    supportingPoints: string[];
    keyExchanges: Array<{
      justice: string;
      question: string;
      context: string;
      significance: string;
    }>;
  }>;
  citedPrecedents: Array<{
    caseName: string;
    citation: string;
    year: number;
    reasonCited: string;
    citedBy: string;
    summary: string;
  }>;
  legalTerms: Array<{
    term: string;
    definition: string;
    examples?: string[];
    relatedTerms?: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

export async function generateSummary(
  client: Anthropic,
  transcriptText: string,
  caseNumber: string,
  termYear: string,
  log: (msg: string) => void = console.log
): Promise<RawAIOutput> {
  const model = process.env.MODEL ?? "claude-opus-4-6";
  log(`Calling Anthropic API (model: ${model})...`);

  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(transcriptText, caseNumber, termYear),
      },
    ],
  });

  let textOutput = "";
  let thinkingChars = 0;

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      if (event.delta.type === "thinking_delta") {
        thinkingChars += event.delta.thinking.length;
      } else if (event.delta.type === "text_delta") {
        textOutput += event.delta.text;
      }
    }
  }

  const finalMessage = await stream.finalMessage();
  log(
    `Done. Input: ${finalMessage.usage.input_tokens} tokens, Output: ${finalMessage.usage.output_tokens} tokens, Thinking: ${thinkingChars} chars`
  );

  const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      "No JSON found in API response:\n" + textOutput.slice(0, 500)
    );
  }

  return JSON.parse(jsonMatch[0]) as RawAIOutput;
}

// ---------------------------------------------------------------------------
// Transform AI output → typed data model
// ---------------------------------------------------------------------------

export function buildResult(
  raw: RawAIOutput,
  caseNumber: string,
  termYear: string,
  transcriptUrl: string,
  docketStatus: CaseSummary["docketStatus"] = "petition"
): ProcessingResult {
  const caseSlug = toSlug(`${caseNumber}-${raw.title}`);

  const newTerms: LegalTerm[] = raw.legalTerms.map((t) => ({
    slug: toSlug(t.term),
    term: t.term,
    definition: t.definition,
    examples: t.examples ?? [],
    relatedTerms: t.relatedTerms ?? [],
  }));

  const newPrecedents: PrecedentCase[] = raw.citedPrecedents.map((p) => ({
    slug: toSlug(p.caseName),
    name: p.caseName,
    citation: p.citation,
    year: p.year,
    summary: p.summary,
    significance: p.reasonCited,
    topics: [],
  }));

  const caseSummary: CaseSummary = {
    slug: caseSlug,
    caseNumber,
    title: raw.title,
    termYear,
    argumentDate: raw.argumentDate,
    transcriptUrl,
    docketStatus,
    backgroundAndFacts: raw.backgroundAndFacts,
    legalQuestion: raw.legalQuestion,
    significance: raw.significance,
    parties: raw.parties.map((p) => ({
      party: p.party,
      role: p.role as "petitioner" | "respondent" | "amicus",
      coreArgument: p.coreArgument,
      supportingPoints: p.supportingPoints,
      keyExchanges: p.keyExchanges,
    })),
    citedPrecedents: raw.citedPrecedents.map((p) => ({
      caseSlug: toSlug(p.caseName),
      caseName: p.caseName,
      citation: p.citation,
      reasonCited: p.reasonCited,
      citedBy: p.citedBy as "petitioner" | "respondent" | "court" | "multiple",
    })),
    legalTermsUsed: newTerms.map((t) => t.slug),
    processedAt: new Date().toISOString(),
  };

  return { case: caseSummary, newTerms, newPrecedents };
}

// ---------------------------------------------------------------------------
// Save results to filesystem
// ---------------------------------------------------------------------------

export function saveResult(
  result: ProcessingResult,
  log: (msg: string) => void = console.log
): void {
  const caseFile = path.join(CASES_DIR, `${result.case.slug}.json`);
  fs.writeFileSync(caseFile, JSON.stringify(result.case, null, 2));
  log(`Saved case: ${result.case.title} → ${result.case.slug}.json`);

  for (const term of result.newTerms) {
    const termFile = path.join(TERMS_DIR, `${term.slug}.json`);
    if (!fs.existsSync(termFile)) {
      fs.writeFileSync(termFile, JSON.stringify(term, null, 2));
      log(`  + term: ${term.term}`);
    }
  }

  for (const precedent of result.newPrecedents) {
    const precedentFile = path.join(PRECEDENTS_DIR, `${precedent.slug}.json`);
    if (!fs.existsSync(precedentFile)) {
      fs.writeFileSync(precedentFile, JSON.stringify(precedent, null, 2));
      log(`  + precedent: ${precedent.name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  log: (msg: string) => void = console.log
): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i < attempts && msg.includes("overloaded")) {
        const wait = i * 30;
        log(`API overloaded — waiting ${wait}s before retry ${i + 1}/${attempts}...`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Unreachable");
}
