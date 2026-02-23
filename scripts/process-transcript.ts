#!/usr/bin/env tsx
/**
 * process-transcript.ts
 *
 * Downloads a Supreme Court oral argument transcript PDF from supremecourt.gov,
 * extracts the text, and uses the Anthropic API to generate a structured summary.
 *
 * Usage:
 *   npx tsx scripts/process-transcript.ts <transcript-url> [case-number] [term-year]
 *
 * Example:
 *   npx tsx scripts/process-transcript.ts \
 *     "https://www.supremecourt.gov/oral_arguments/argument_transcripts/2024/23-411_6j37.pdf" \
 *     "23-411" "2024"
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  downloadPdf,
  extractText,
  generateSummary,
  buildResult,
  saveResult,
  ensureDataDirs,
  withRetry,
} from "./pipeline.js";

async function main() {
  const [, , transcriptUrl, caseNumber = "unknown", termYear = "2024"] =
    process.argv;

  if (!transcriptUrl) {
    console.error(
      "Usage: npx tsx scripts/process-transcript.ts <transcript-url> [case-number] [term-year]"
    );
    console.error(
      "\nExample:\n  npx tsx scripts/process-transcript.ts \\\n    https://www.supremecourt.gov/oral_arguments/argument_transcripts/2024/23-411_6j37.pdf \\\n    23-411 2024"
    );
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  ensureDataDirs();
  const client = new Anthropic();

  try {
    console.log(`\nDownloading transcript from:\n  ${transcriptUrl}`);
    const pdfBuffer = await downloadPdf(transcriptUrl);
    console.log(`Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    console.log("Extracting text from PDF...");
    const transcriptText = await extractText(pdfBuffer);
    console.log(`Extracted ${transcriptText.length.toLocaleString()} characters`);

    const rawOutput = await withRetry(() =>
      generateSummary(client, transcriptText, caseNumber, termYear)
    );

    const result = buildResult(rawOutput, caseNumber, termYear, transcriptUrl);
    console.log(`\nCase: ${result.case.title}`);
    console.log(`Terms identified: ${result.newTerms.length}`);
    console.log(`Precedents cited: ${result.newPrecedents.length}`);

    saveResult(result);
    console.log("\nProcessing complete.");
  } catch (error) {
    console.error("\nError:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
