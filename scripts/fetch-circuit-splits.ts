/**
 * fetch-circuit-splits.ts
 *
 * Queries CourtListener for recent published federal circuit court opinions
 * that acknowledge disagreements with other circuits, then uses Claude to
 * identify and structure distinct splits. Saves to data/circuit-splits.json.
 *
 * Run: npx tsx scripts/fetch-circuit-splits.ts
 */

import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";

// ── Load .env.local for local dev ─────────────────────────────────────────────
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

// ── Constants ─────────────────────────────────────────────────────────────────

const CL_BASE   = "https://www.courtlistener.com";
const DATA_DIR  = path.join(process.cwd(), "data");
const CASES_DIR = path.join(DATA_DIR, "cases");

export const CIRCUITS: Record<string, { name: string; shortName: string }> = {
  ca1:  { name: "First Circuit",    shortName: "1st"  },
  ca2:  { name: "Second Circuit",   shortName: "2nd"  },
  ca3:  { name: "Third Circuit",    shortName: "3rd"  },
  ca4:  { name: "Fourth Circuit",   shortName: "4th"  },
  ca5:  { name: "Fifth Circuit",    shortName: "5th"  },
  ca6:  { name: "Sixth Circuit",    shortName: "6th"  },
  ca7:  { name: "Seventh Circuit",  shortName: "7th"  },
  ca8:  { name: "Eighth Circuit",   shortName: "8th"  },
  ca9:  { name: "Ninth Circuit",    shortName: "9th"  },
  ca10: { name: "Tenth Circuit",    shortName: "10th" },
  ca11: { name: "Eleventh Circuit", shortName: "11th" },
  cadc: { name: "D.C. Circuit",     shortName: "D.C." },
  cafc: { name: "Federal Circuit",  shortName: "Fed." },
};

// Circuits to query for general splits (exclude Federal Circuit — narrow jurisdiction)
const SPLIT_CIRCUITS = Object.keys(CIRCUITS).filter((k) => k !== "cafc");

// Search queries that reliably surface opinions acknowledging circuit conflicts
const SPLIT_QUERIES = [
  '"circuit split"',
  '"circuits are divided"',
  '"circuits have divided"',
  '"conflict among the circuits"',
  '"conflict in the circuits"',
  '"other circuits have held" OR "sister circuits"',
];

// ── CourtListener API helpers ──────────────────────────────────────────────────

async function clFetch(endpoint: string): Promise<unknown> {
  const token = process.env.COURTLISTENER_API_KEY;
  if (!token) throw new Error("COURTLISTENER_API_KEY not set");
  const url = `${CL_BASE}/api/rest/v4${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${token}`,
      "User-Agent": "SupremeCourtWiki/1.0 (+https://github.com/supreme-court-wiki)",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CourtListener ${res.status} ${url}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

interface ClOpinionHit {
  id?: number;
  snippet?: string;
}

interface ClSearchHit {
  cluster_id?: number;
  id?: number;
  caseName?: string;
  case_name?: string;
  court_id?: string;
  court?: string;
  dateFiled?: string;
  date_filed?: string;
  citation?: string[];
  snippet?: string;          // sometimes at top level
  opinions?: ClOpinionHit[]; // snippet also lives here
  absolute_url?: string;
  status?: string;
}

async function searchOpinions(query: string, pageSize = 20): Promise<ClSearchHit[]> {
  // Build URL manually — court must be repeated per param, not comma-joined
  const base = new URLSearchParams({
    type: "o",
    q: query,
    filed_after: "2023-01-01",
    page_size: String(pageSize),
    order_by: "score desc",
  });
  const courtPart = SPLIT_CIRCUITS.map((c) => `court=${c}`).join("&");
  const data = await clFetch(`/search/?${base}&${courtPart}`) as {
    results?: ClSearchHit[];
  };
  return data.results ?? [];
}

/** Attempt to fetch the plain text of the lead opinion for richer Claude context. */
async function fetchOpinionText(hit: ClSearchHit): Promise<string> {
  const clusterId = hit.cluster_id ?? hit.id;
  if (!clusterId) return "";
  try {
    const cluster = await clFetch(`/clusters/${clusterId}/`) as {
      sub_opinions?: string[];
    };
    const opinionUrls: string[] = cluster.sub_opinions ?? [];
    if (opinionUrls.length === 0) return "";
    const opId = opinionUrls[0].match(/\/opinions\/(\d+)\//)?.[1];
    if (!opId) return "";
    const opinion = await clFetch(`/opinions/${opId}/`) as {
      plain_text?: string; html?: string;
    };
    const raw = opinion.plain_text ?? opinion.html ?? "";
    return raw
      .slice(0, 5000)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  } catch {
    return "";
  }
}

// ── Normalise hit fields ───────────────────────────────────────────────────────

function normHit(h: ClSearchHit) {
  // Snippet may be at top level or nested inside opinions[0]
  const topSnippet = h.snippet ?? "";
  const opSnippet = h.opinions?.[0]?.snippet ?? "";
  const rawSnippet = topSnippet.length >= opSnippet.length ? topSnippet : opSnippet;
  return {
    clusterId: h.cluster_id ?? h.id ?? 0,
    caseName: h.caseName ?? h.case_name ?? "Unknown",
    courtId: h.court_id ?? h.court ?? "",
    dateFiled: h.dateFiled ?? h.date_filed ?? "",
    citations: h.citation ?? [],
    snippet: rawSnippet.replace(/<[^>]+>/g, "").trim(),
    url: h.absolute_url
      ? `${CL_BASE}${h.absolute_url}`
      : `${CL_BASE}/opinion/${h.cluster_id ?? h.id}/`,
  };
}

/** Map court string → circuit key. CourtListener may return an ID or a name. */
function resolveCircuitKey(courtStr: string): string {
  const s = courtStr.toLowerCase().replace(/[\s.]+/g, "");
  if (CIRCUITS[s]) return s;
  if (s.includes("first") || s === "ca1")   return "ca1";
  if (s.includes("second") || s === "ca2")  return "ca2";
  if (s.includes("third") || s === "ca3")   return "ca3";
  if (s.includes("fourth") || s === "ca4")  return "ca4";
  if (s.includes("fifth") || s === "ca5")   return "ca5";
  if (s.includes("sixth") || s === "ca6")   return "ca6";
  if (s.includes("seventh") || s === "ca7") return "ca7";
  if (s.includes("eighth") || s === "ca8")  return "ca8";
  if (s.includes("ninth") || s === "ca9")   return "ca9";
  if (s.includes("tenth") || s === "ca10")  return "ca10";
  if (s.includes("eleventh") || s === "ca11") return "ca11";
  if (s.includes("dc") || s.includes("columbia") || s === "cadc") return "cadc";
  if (s.includes("federal") || s === "cafc") return "cafc";
  return courtStr; // fallback to raw string
}

// ── Load pending SCOTUS cases for context ─────────────────────────────────────

// Regex that reliably signals a circuit split exists
const SPLIT_SIGNAL_RE =
  /\b(circuit split|circuits (are|have been|have) (divided|split)|split (among|between|in) the circuits|conflict (among|between|in) the circuits|circuits? (disagree|conflict)|sister circuits|other circuits have held|courts (are|have been|have) (divided|split))\b/i;

interface ScotusContext {
  slug: string;
  caseNumber: string;
  title: string;
  legalQuestion: string;
  termYear: string;
  docketStatus?: string;
  /** Set when the case description itself describes a circuit split. */
  splitDescription?: string;
}

function loadPendingScotus(): ScotusContext[] {
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  const results: ScotusContext[] = [];
  for (const f of files) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), "utf-8"));
      if (d.termYear !== "2025") continue;
      if (d.docketStatus === "decided") continue;

      // Detect whether this SCOTUS case describes a circuit split
      const splitText = [d.significance ?? "", d.backgroundAndFacts ?? ""].join(" ");
      const describesSplit = SPLIT_SIGNAL_RE.test(splitText);

      results.push({
        slug: d.slug,
        caseNumber: d.caseNumber,
        title: d.title,
        legalQuestion: d.legalQuestion ?? "",
        termYear: d.termYear,
        docketStatus: d.docketStatus,
        // Include the first ~600 chars of significance as the split description
        splitDescription: describesSplit
          ? (d.significance ?? "").slice(0, 600)
          : undefined,
      });
    } catch { /* skip */ }
  }
  return results;
}

// ── Claude analysis ───────────────────────────────────────────────────────────

export interface CircuitCaseRef {
  key: string;
  name: string;
  shortName: string;
  caseName: string;
  year: number;
  citation?: string;
  url: string;
}

export interface CircuitPosition {
  label: string;
  summary: string;
  circuits: CircuitCaseRef[];
}

export interface CircuitSplit {
  id: string;
  legalQuestion: string;
  description: string;
  area: string;
  positions: CircuitPosition[];
  status: "open" | "scotus_pending" | "scotus_resolved";
  relatedScotusSlug?: string;
  relatedScotusTitle?: string;
  lastUpdated: string;
}

export interface CircuitSplitsData {
  generated: string;
  splits: CircuitSplit[];
}

interface OpinionDoc {
  caseName: string;
  courtId: string;
  dateFiled: string;
  citations: string[];
  snippet: string;
  fullText: string;
  url: string;
}

async function analyzeSplits(
  docs: OpinionDoc[],
  scotusCases: ScotusContext[],
): Promise<CircuitSplit[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Format docs for the prompt
  const opinionBlocks = docs
    .map((d, i) => {
      const circuit = CIRCUITS[resolveCircuitKey(d.courtId)];
      const circuitLabel = circuit
        ? `${circuit.name} (${d.courtId})`
        : d.courtId;
      const text = d.fullText || d.snippet;
      const citation = d.citations[0] ?? "";
      return (
        `--- Opinion ${i + 1} ---\n` +
        `Case: ${d.caseName}${citation ? ` — ${citation}` : ""}\n` +
        `Court: ${circuitLabel}\n` +
        `Date: ${d.dateFiled}\n` +
        `URL: ${d.url}\n` +
        `Text:\n${text}\n`
      );
    })
    .join("\n");

  // Split SCOTUS cases into two groups: those that describe a split (higher priority)
  // and the rest (used only for cross-reference linking).
  const scotusSplitCases = scotusCases.filter((c) => c.splitDescription);
  const scotusRefCases   = scotusCases.filter((c) => !c.splitDescription);

  const scotusSplitBlock = scotusSplitCases.length > 0
    ? scotusSplitCases
        .map(
          (c) =>
            `• ${c.caseNumber} — ${c.title} [slug: ${c.slug}]\n` +
            `  Legal question: ${c.legalQuestion}\n` +
            `  Why it matters (describes the split): ${c.splitDescription}`,
        )
        .join("\n\n")
    : "(none)";

  const scotusRefBlock = scotusRefCases
    .map(
      (c) =>
        `• ${c.caseNumber} — ${c.title}\n  Question: ${c.legalQuestion}\n  Slug: ${c.slug}`,
    )
    .join("\n");

  const prompt = `You are an expert federal appellate attorney identifying active circuit splits — genuine doctrinal disagreements between federal circuit courts on a question of federal law.

You have TWO sources of evidence:

SOURCE A — Recent circuit court opinions from CourtListener that discuss circuit splits.
SOURCE B — Pending SCOTUS cases whose own descriptions explicitly describe a circuit split (these are the splits that caused SCOTUS to grant cert; they are REAL and MUST appear in your output if you can populate at least two named circuits on different sides).

For each DISTINCT split you identify from either source, return a structured entry.

Return ONLY a valid JSON array (no prose, no markdown). Each element must match this schema exactly:

{
  "id": "kebab-case-slug",
  "legalQuestion": "Whether [precise legal question, 1-2 sentences]",
  "description": "2-3 sentence explanation of why the circuits disagree and why it matters.",
  "area": "Legal area (e.g. 'Criminal Law', 'Immigration', 'Fourth Amendment', 'Administrative Law', 'Employment', 'Bankruptcy', etc.)",
  "positions": [
    {
      "label": "Short label (e.g. 'Yes', 'No', or a brief phrase)",
      "summary": "Holds that... (1-2 sentences describing this position)",
      "circuits": [
        {
          "key": "ca5",
          "name": "Fifth Circuit",
          "shortName": "5th",
          "caseName": "Smith v. United States",
          "year": 2024,
          "citation": "123 F.4th 456",
          "url": "https://www.courtlistener.com/opinion/..."
        }
      ]
    }
  ],
  "status": "open",
  "relatedScotusSlug": null,
  "relatedScotusTitle": null
}

Rules:
- Only include genuine doctrinal splits (not mere factual variations or circuit-specific rules)
- A split REQUIRES AT LEAST 2 named circuits on DIFFERENT sides — skip any split where you cannot name specific circuits on both sides
- Do NOT invent circuit positions — only include circuits explicitly identified in the text
- For circuit keys, use: ca1, ca2, ca3, ca4, ca5, ca6, ca7, ca8, ca9, ca10, ca11, cadc, cafc
- SOURCE B (SCOTUS-described splits) MUST be included when you can identify at least 2 named circuits on different sides — their relatedScotusSlug and relatedScotusTitle must be set
- If SCOTUS has already resolved the split, set status to "scotus_resolved"
- If SCOTUS has granted cert on a split, set status to "scotus_pending" and fill relatedScotusSlug / relatedScotusTitle
- Otherwise status is "open"
- Merge opinions about the same split into one entry
- Maximum 20 splits — prioritize significant ones; SOURCE B entries are always significant
- If you cannot identify any genuine splits, return an empty array []

SOURCE B — SCOTUS cases that explicitly describe circuit splits (MUST generate entries for these):
${scotusSplitBlock}

SOURCE A (cross-reference only for non-SOURCE-B SCOTUS links):
${scotusRefBlock}

SOURCE A — Circuit court opinion documents from CourtListener:
${opinionBlocks}`;

  console.log("  Sending to Claude for analysis...");
  const msg = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw =
    msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

  // Extract JSON array from response — find outermost [ ... ]
  const jsonStart = raw.indexOf("[");
  if (jsonStart === -1) {
    console.warn("  Claude returned no JSON array — empty split list");
    return [];
  }
  // Walk forward to find the matching closing bracket
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === "[" || raw[i] === "{") depth++;
    else if (raw[i] === "]" || raw[i] === "}") {
      depth--;
      if (depth === 0 && raw[i] === "]") { jsonEnd = i; break; }
    }
  }
  if (jsonEnd === -1) {
    console.warn("  Could not find end of JSON array in Claude output");
    console.warn("  Raw output (first 500 chars):", raw.slice(0, 500));
    return [];
  }

  let splits: CircuitSplit[];
  try {
    splits = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (parseErr) {
    console.warn("  JSON parse error:", parseErr);
    console.warn("  Raw output (first 500 chars):", raw.slice(0, 500));
    return [];
  }

  // Enrich with circuit metadata (fill name/shortName from our CIRCUITS map)
  splits = splits.map((split) => ({
    ...split,
    lastUpdated: new Date().toISOString().split("T")[0],
    positions: split.positions.map((pos) => ({
      ...pos,
      circuits: pos.circuits.map((c) => {
        const meta = CIRCUITS[c.key] ?? { name: c.name, shortName: c.shortName };
        return { ...c, name: meta.name, shortName: meta.shortName };
      }),
    })),
  }));

  return splits;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function searchOpinionsForCircuit(
  query: string,
  circuitKey: string,
  pageSize = 5,
): Promise<ClSearchHit[]> {
  const base = new URLSearchParams({
    type: "o",
    q: query,
    filed_after: "2023-01-01",
    page_size: String(pageSize),
    order_by: "score desc",
  });
  const data = await clFetch(`/search/?${base}&court=${circuitKey}`) as {
    results?: ClSearchHit[];
  };
  return data.results ?? [];
}

async function main() {
  console.log("=== Fetching Circuit Splits ===\n");

  const hitMap = new Map<number, ClSearchHit>();

  // 1a — Broad queries across all circuits
  for (const query of SPLIT_QUERIES) {
    console.log(`Searching (all circuits): ${query}`);
    try {
      const results = await searchOpinions(query, 20);
      console.log(`  → ${results.length} results`);
      for (const h of results) {
        const id = h.cluster_id ?? h.id;
        if (id && !hitMap.has(id)) hitMap.set(id, h);
      }
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn(`  ✗ search failed: ${err}`);
    }
  }

  // 1b — Per-circuit sweep to ensure broad geographic coverage
  // Use the two most reliable split-acknowledgment phrases
  const circuitQueries = ['"circuit split"', '"sister circuits"'];
  for (const circuitKey of SPLIT_CIRCUITS) {
    for (const query of circuitQueries) {
      try {
        const results = await searchOpinionsForCircuit(query, circuitKey, 5);
        for (const h of results) {
          const id = h.cluster_id ?? h.id;
          if (id && !hitMap.has(id)) hitMap.set(id, h);
        }
        await new Promise((r) => setTimeout(r, 200));
      } catch { /* skip */ }
    }
  }

  console.log(`\nTotal unique opinions found: ${hitMap.size}`);

  // 2 — Select up to 30 opinions sampled evenly across circuits
  //     (avoids the CADC-heavy bias from the broad searches)
  const byCircuit = new Map<string, ClSearchHit[]>();
  for (const h of hitMap.values()) {
    const key = resolveCircuitKey(h.court_id ?? h.court ?? "");
    if (!byCircuit.has(key)) byCircuit.set(key, []);
    byCircuit.get(key)!.push(h);
  }

  const MAX_TOTAL = 30;
  const perCircuit = Math.max(2, Math.ceil(MAX_TOTAL / byCircuit.size));
  const hits: ClSearchHit[] = [];
  for (const group of byCircuit.values()) {
    hits.push(...group.slice(0, perCircuit));
    if (hits.length >= MAX_TOTAL) break;
  }
  // If we still have room, fill from remaining
  if (hits.length < MAX_TOTAL) {
    const seenIds = new Set(hits.map((h) => h.cluster_id ?? h.id));
    for (const h of hitMap.values()) {
      if (!seenIds.has(h.cluster_id ?? h.id)) hits.push(h);
      if (hits.length >= MAX_TOTAL) break;
    }
  }
  const docs: OpinionDoc[] = [];

  console.log("\nFetching opinion texts...");
  for (const hit of hits) {
    const n = normHit(hit);
    let fullText = "";
    try {
      fullText = await fetchOpinionText(hit);
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.warn(`  ✗ text fetch failed for ${n.caseName}: ${err}`);
    }
    docs.push({
      caseName: n.caseName,
      courtId: resolveCircuitKey(n.courtId),
      dateFiled: n.dateFiled,
      citations: n.citations,
      snippet: n.snippet,
      fullText,
      url: n.url,
    });
    console.log(
      `  ✓ ${n.caseName.slice(0, 60)} [${n.courtId}]` +
        (fullText ? ` — ${fullText.length} chars` : " — snippet only"),
    );
  }

  // 3 — Load pending SCOTUS cases
  const scotusCases = loadPendingScotus();
  console.log(`\nLoaded ${scotusCases.length} pending SCOTUS cases for context`);

  // 4 — Claude analysis
  console.log("\nRunning Claude analysis...");
  let splits: CircuitSplit[] = [];
  try {
    splits = await analyzeSplits(docs, scotusCases);
    console.log(`  ✓ ${splits.length} splits identified`);
    splits.forEach((s) => console.log(`    • [${s.area}] ${s.legalQuestion.slice(0, 80)}...`));
  } catch (err) {
    console.error("  ✗ Claude analysis failed:", err);
  }

  // 5 — Save
  const output: CircuitSplitsData = {
    generated: new Date().toISOString().split("T")[0],
    splits,
  };

  const outPath = path.join(DATA_DIR, "circuit-splits.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ Saved ${splits.length} circuit splits → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
