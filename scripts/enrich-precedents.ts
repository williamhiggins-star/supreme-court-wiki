#!/usr/bin/env tsx
/**
 * enrich-precedents.ts
 *
 * Generates full standalone wiki entries for precedent case stubs.
 * Each enriched entry includes: background & facts, each party's arguments,
 * the Court's ruling, vote split, and dissenting opinions — the same depth
 * as a full case page, independent of any transcript it was cited in.
 *
 * Usage:
 *   npx tsx scripts/enrich-precedents.ts          # enrich stubs only
 *   npx tsx scripts/enrich-precedents.ts --force  # re-enrich everything
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import type {
  PrecedentCase,
  PrecedentPartyArgument,
  DissentingOpinion,
} from "../src/types/index.js";

const PRECEDENTS_DIR = path.join(process.cwd(), "data", "precedents");

const SYSTEM_PROMPT = `You are a legal expert and writer who explains US Supreme Court cases clearly and accurately to a general audience with no legal background.
Your writing is engaging, precise, and treats the reader as intelligent but unfamiliar with legal jargon.
You always respond with valid JSON matching the exact schema provided. Do not include any text outside the JSON object.`;

function isStub(p: PrecedentCase): boolean {
  return !p.parties || p.parties.length === 0;
}

interface RawEnrichedCase {
  legalQuestion: string;
  backgroundAndFacts: string;
  parties: Array<{
    party: string;
    role: string;
    coreArgument: string;
    supportingPoints: string[];
  }>;
  holding: string;
  voteCount?: string;
  majorityAuthor?: string;
  dissentingOpinions?: Array<{
    author: string;
    joinedBy?: string[];
    coreArgument: string;
    keyPoints: string[];
  }>;
  concurringNote?: string;
}

async function enrichPrecedent(
  client: Anthropic,
  precedent: PrecedentCase
): Promise<PrecedentCase> {
  console.log(`  Enriching: ${precedent.name} (${precedent.year})...`);

  const prompt = `Write a full standalone wiki entry for the US Supreme Court case "${precedent.name}" (${precedent.citation}, decided ${precedent.year}).

This entry will appear on its own page and must stand alone — do not refer to any other case that cited it.

Return a JSON object with EXACTLY this structure:

{
  "legalQuestion": "One clear sentence stating the core legal question the Court was asked to decide",

  "backgroundAndFacts": "3–5 paragraphs in plain English covering: who the parties were and what their dispute was about, the key facts that gave rise to the case, how it moved through the lower courts, and why the Supreme Court agreed to hear it. Write for a curious non-lawyer.",

  "parties": [
    {
      "party": "Name of the party (e.g. 'Gerald Bostock' or 'Clayton County')",
      "role": "petitioner or respondent",
      "coreArgument": "2–3 sentences summarizing their main legal position in plain English",
      "supportingPoints": [
        "Key supporting argument 1",
        "Key supporting argument 2",
        "Key supporting argument 3"
      ]
    }
  ],

  "holding": "3–5 paragraphs explaining what the Court decided, the core reasoning of the majority opinion, and why the majority reached that conclusion. Include the vote count (e.g. 6–3) and the author of the majority opinion. Plain English throughout.",

  "voteCount": "e.g. '6-3' or '5-4'",

  "majorityAuthor": "Full name of the justice who wrote the majority opinion",

  "dissentingOpinions": [
    {
      "author": "Full name of the dissenting justice",
      "joinedBy": ["Name of justice who joined", "Another name"],
      "coreArgument": "2–3 sentences summarizing what the dissent argued and why it disagreed with the majority",
      "keyPoints": [
        "Key point from the dissent 1",
        "Key point from the dissent 2"
      ]
    }
  ],

  "concurringNote": "If there were notable concurring opinions, briefly describe them in 1–2 sentences. Omit this field if there were none worth noting."
}

Context from the case record (use only as a starting point — be much more detailed):
- Summary: "${precedent.summary}"
- Why it gets cited: "${precedent.significance}"`;

  const model = process.env.MODEL ?? "claude-opus-4-6";
  const stream = client.messages.stream({
    model,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  let text = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      text += event.delta.text;
      process.stdout.write(".");
    }
  }
  console.log();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    throw new Error(`No JSON in response for ${precedent.name}\n${text.slice(0, 300)}`);

  const raw = JSON.parse(jsonMatch[0]) as RawEnrichedCase;

  const parties: PrecedentPartyArgument[] = (raw.parties ?? []).map((p) => ({
    party: p.party,
    role: (p.role === "respondent" ? "respondent" : "petitioner") as
      | "petitioner"
      | "respondent",
    coreArgument: p.coreArgument,
    supportingPoints: p.supportingPoints ?? [],
  }));

  const dissentingOpinions: DissentingOpinion[] = (
    raw.dissentingOpinions ?? []
  ).map((d) => ({
    author: d.author,
    joinedBy: d.joinedBy ?? [],
    coreArgument: d.coreArgument,
    keyPoints: d.keyPoints ?? [],
  }));

  return {
    ...precedent,
    legalQuestion: raw.legalQuestion,
    backgroundAndFacts: raw.backgroundAndFacts,
    parties,
    holding: raw.holding,
    voteCount: raw.voteCount,
    majorityAuthor: raw.majorityAuthor,
    dissentingOpinions,
    concurringNote: raw.concurringNote,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  const client = new Anthropic();

  const files = fs
    .readdirSync(PRECEDENTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log("No precedent files found in data/precedents/");
    process.exit(0);
  }

  const toEnrich = files
    .map((f) => ({
      file: f,
      precedent: JSON.parse(
        fs.readFileSync(path.join(PRECEDENTS_DIR, f), "utf-8")
      ) as PrecedentCase,
    }))
    .filter(({ precedent }) => force || isStub(precedent));

  if (toEnrich.length === 0) {
    console.log(
      "All precedents already have full entries. Use --force to regenerate."
    );
    process.exit(0);
  }

  console.log(`Generating full wiki entries for ${toEnrich.length} case(s)...\n`);

  for (const { file, precedent } of toEnrich) {
    try {
      const enriched = await enrichPrecedent(client, precedent);
      fs.writeFileSync(
        path.join(PRECEDENTS_DIR, file),
        JSON.stringify(enriched, null, 2)
      );
      console.log(`  ✓ Saved: ${precedent.name}\n`);
    } catch (err) {
      console.error(
        `  ✗ Failed: ${precedent.name} —`,
        err instanceof Error ? err.message : err,
        "\n"
      );
    }
  }

  console.log("Done.");
}

main();
