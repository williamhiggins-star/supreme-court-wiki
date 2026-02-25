/**
 * fetch-appellate-impacts.ts
 *
 * Queries CourtListener for recent published federal circuit court opinions
 * with significant business impact (securities, antitrust, L&E, IP,
 * arbitration, class actions, bankruptcy). Uses Claude to classify and
 * structure each decision. Saves to data/appellate-impacts.json.
 *
 * Run: npx tsx scripts/fetch-appellate-impacts.ts
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

const CL_BASE  = "https://www.courtlistener.com";
const DATA_DIR = path.join(process.cwd(), "data");

const CIRCUITS: Record<string, { name: string; shortName: string }> = {
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

const ALL_CIRCUITS = Object.keys(CIRCUITS);

// Targeted queries per business area — each reliably surfaces relevant opinions
const AREA_QUERIES: { area: string; query: string }[] = [
  { area: "Securities",          query: '"securities fraud" OR "SEC" OR "Exchange Act" OR "insider trading" OR "10b-5"' },
  { area: "Antitrust",           query: '"antitrust" OR "Sherman Act" OR "Clayton Act" OR "monopolization" OR "price-fixing"' },
  { area: "Labor & Employment",  query: '"ERISA" OR "Title VII" OR "FLSA" OR "NLRA" OR "collective bargaining" OR "wage and hour"' },
  { area: "Intellectual Property", query: '"patent" OR "copyright" OR "trademark" OR "trade secret" OR "infringement"' },
  { area: "Arbitration",         query: '"Federal Arbitration Act" OR "arbitration agreement" OR "class arbitration" OR "FAA preemption"' },
  { area: "Class Actions",       query: '"class certification" OR "Rule 23" OR "CAFA" OR "class action" OR "ascertainability"' },
  { area: "Bankruptcy",          query: '"Chapter 11" OR "automatic stay" OR "plan confirmation" OR "preference" OR "cramdown"' },
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
  docketNumber?: string;
  docket_number?: string;
  citation?: string[];
  snippet?: string;
  opinions?: ClOpinionHit[];
  absolute_url?: string;
}

function normHit(h: ClSearchHit) {
  const topSnippet = h.snippet ?? "";
  const opSnippet = h.opinions?.[0]?.snippet ?? "";
  const rawSnippet = topSnippet.length >= opSnippet.length ? topSnippet : opSnippet;
  return {
    clusterId: h.cluster_id ?? h.id ?? 0,
    caseName: h.caseName ?? h.case_name ?? "Unknown",
    courtId: h.court_id ?? h.court ?? "",
    dateFiled: h.dateFiled ?? h.date_filed ?? "",
    docketNumber: h.docketNumber ?? h.docket_number ?? "",
    citations: h.citation ?? [],
    snippet: rawSnippet.replace(/<[^>]+>/g, "").trim(),
    url: h.absolute_url
      ? `${CL_BASE}${h.absolute_url}`
      : `${CL_BASE}/opinion/${h.cluster_id ?? h.id}/`,
  };
}

function resolveCircuitKey(courtStr: string): string {
  const s = courtStr.toLowerCase().replace(/[\s.]+/g, "");
  if (CIRCUITS[s]) return s;
  if (s.includes("first"))   return "ca1";
  if (s.includes("second"))  return "ca2";
  if (s.includes("third"))   return "ca3";
  if (s.includes("fourth"))  return "ca4";
  if (s.includes("fifth"))   return "ca5";
  if (s.includes("sixth"))   return "ca6";
  if (s.includes("seventh")) return "ca7";
  if (s.includes("eighth"))  return "ca8";
  if (s.includes("ninth"))   return "ca9";
  if (s.includes("tenth"))   return "ca10";
  if (s.includes("eleventh")) return "ca11";
  if (s.includes("dc") || s.includes("columbia")) return "cadc";
  if (s.includes("federal")) return "cafc";
  return courtStr;
}

async function searchOpinionsForArea(
  query: string,
  pageSize = 8,
): Promise<ClSearchHit[]> {
  // File date: last 90 days
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceStr = since.toISOString().split("T")[0];

  const base = new URLSearchParams({
    type: "o",
    q: query,
    filed_after: sinceStr,
    page_size: String(pageSize),
    order_by: "score desc",
    stat_Precedential: "on",
  });
  const courtPart = ALL_CIRCUITS.map((c) => `court=${c}`).join("&");
  const data = await clFetch(`/search/?${base}&${courtPart}`) as {
    results?: ClSearchHit[];
  };
  return data.results ?? [];
}

async function fetchOpinionText(hit: ClSearchHit): Promise<string> {
  const clusterId = hit.cluster_id ?? hit.id;
  if (!clusterId) return "";
  try {
    const cluster = await clFetch(`/clusters/${clusterId}/`) as {
      sub_opinions?: string[];
    };
    const opId = (cluster.sub_opinions ?? [])[0]?.match(/\/opinions\/(\d+)\//)?.[1];
    if (!opId) return "";
    const opinion = await clFetch(`/opinions/${opId}/`) as {
      plain_text?: string; html?: string;
    };
    const raw = opinion.plain_text ?? opinion.html ?? "";
    return raw.slice(0, 6000).replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  } catch {
    return "";
  }
}

// ── Data types ─────────────────────────────────────────────────────────────────

export interface AppellateImpact {
  id: string;
  caseName: string;
  docketNumber: string;
  court: string;
  courtKey: string;
  date: string;
  area: string;
  legalQuestion: string;
  description: string;
  positiveImplications: string;
  negativeImplications: string;
  url: string;
  lastUpdated: string;
}

export interface AppellateImpactsData {
  generated: string;
  impacts: AppellateImpact[];
}

// ── Claude analysis ────────────────────────────────────────────────────────────

interface OpinionDoc {
  caseName: string;
  courtId: string;
  courtName: string;
  dateFiled: string;
  docketNumber: string;
  citations: string[];
  snippet: string;
  fullText: string;
  url: string;
}

async function analyzeImpacts(docs: OpinionDoc[]): Promise<AppellateImpact[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const opinionBlocks = docs
    .map((d, i) => {
      const text = d.fullText || d.snippet;
      const citation = d.citations[0] ?? d.docketNumber ?? "";
      return (
        `--- Opinion ${i + 1} ---\n` +
        `Case: ${d.caseName}${citation ? ` — ${citation}` : ""}\n` +
        `Court: ${d.courtName} (${d.courtId})\n` +
        `Date: ${d.dateFiled}\n` +
        `URL: ${d.url}\n` +
        `Text:\n${text}\n`
      );
    })
    .join("\n");

  const prompt = `You are an expert corporate attorney analyzing recent federal appellate court opinions for significant business impact.

Below are recent published federal appellate court opinions. Identify those with significant business impact in any of these areas:
- Securities (SEC enforcement, securities fraud, disclosure, insider trading)
- Antitrust (Sherman Act, Clayton Act, monopolization, merger review, FTC)
- Labor & Employment (ERISA, Title VII, FLSA, NLRA, wage & hour, discrimination, non-compete)
- Intellectual Property (patents, copyright, trademark, trade secrets)
- Arbitration (FAA, arbitration agreements, class arbitration waivers, enforceability)
- Class Actions (Rule 23, class certification, CAFA, ascertainability, damages models)
- Bankruptcy (Chapter 11, automatic stay, preferences, plan confirmation, cramdown)

Return ONLY a valid JSON array (no prose, no markdown). Each element must match this schema exactly:

{
  "id": "kebab-case-slug-from-case-name",
  "caseName": "Smith Corp. v. Jones Inc.",
  "docketNumber": "No. 23-1234",
  "court": "Second Circuit",
  "courtKey": "ca2",
  "date": "2024-02-15",
  "area": "Securities",
  "legalQuestion": "Whether [precise legal question the court resolved, 1-2 sentences].",
  "description": "2-3 sentence summary of the holding and why it matters for business.",
  "positiveImplications": "1-2 sentences on how this benefits or protects business interests. Write 'None significant.' if purely unfavorable.",
  "negativeImplications": "1-2 sentences on how this creates liability, burden, or risk for business. Write 'None significant.' if purely favorable.",
  "url": "https://www.courtlistener.com/opinion/..."
}

Rules:
- Only include opinions with genuine, significant business impact — skip minor procedural rulings
- area must be exactly one of: Securities, Antitrust, Labor & Employment, Intellectual Property, Arbitration, Class Actions, Bankruptcy
- For courtKey use: ca1, ca2, ca3, ca4, ca5, ca6, ca7, ca8, ca9, ca10, ca11, cadc, cafc
- court must be the full display name, e.g. "Second Circuit", "D.C. Circuit"
- positiveImplications and negativeImplications are from a corporate/business perspective
- date must be YYYY-MM-DD
- Maximum 15 impacts — prioritize the most commercially significant decisions
- If none of the opinions has meaningful business impact, return []

Opinion documents:
${opinionBlocks}`;

  console.log("  Sending to Claude for analysis...");
  const msg = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

  // Extract JSON array using bracket-counting parser
  const jsonStart = raw.indexOf("[");
  if (jsonStart === -1) {
    console.warn("  Claude returned no JSON array");
    return [];
  }
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
    return [];
  }

  let impacts: AppellateImpact[];
  try {
    impacts = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (e) {
    console.warn("  JSON parse error:", e);
    return [];
  }

  const today = new Date().toISOString().split("T")[0];
  return impacts.map((imp) => ({
    ...imp,
    // Ensure court name is resolved from courtKey if missing
    court: imp.court || (CIRCUITS[imp.courtKey]?.name ?? imp.courtKey),
    lastUpdated: today,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Fetching Appellate Impacts ===\n");

  const hitMap = new Map<number, ClSearchHit>();

  // 1 — Query CourtListener for each business area
  for (const { area, query } of AREA_QUERIES) {
    console.log(`Searching [${area}]: ${query.slice(0, 60)}...`);
    try {
      const results = await searchOpinionsForArea(query, 8);
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

  console.log(`\nTotal unique opinions found: ${hitMap.size}`);

  // 2 — Sample evenly (avoid bias toward any single area's search results)
  const MAX_TOTAL = 40;
  const hits = [...hitMap.values()].slice(0, MAX_TOTAL);

  // 3 — Fetch full opinion text for each
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
    const courtKey = resolveCircuitKey(n.courtId);
    docs.push({
      caseName: n.caseName,
      courtId: courtKey,
      courtName: CIRCUITS[courtKey]?.name ?? courtKey,
      dateFiled: n.dateFiled,
      docketNumber: n.docketNumber,
      citations: n.citations,
      snippet: n.snippet,
      fullText,
      url: n.url,
    });
    console.log(
      `  ✓ ${n.caseName.slice(0, 60)} [${courtKey}]` +
        (fullText ? ` — ${fullText.length} chars` : " — snippet only"),
    );
  }

  // 4 — Claude analysis
  console.log("\nRunning Claude analysis...");
  let impacts: AppellateImpact[] = [];
  try {
    impacts = await analyzeImpacts(docs);
    console.log(`  ✓ ${impacts.length} business-relevant impacts identified`);
    impacts.forEach((imp) =>
      console.log(`    • [${imp.area}] ${imp.caseName} — ${imp.legalQuestion.slice(0, 60)}...`),
    );
  } catch (err) {
    console.error("  ✗ Claude analysis failed:", err);
  }

  // 5 — Save
  const output: AppellateImpactsData = {
    generated: new Date().toISOString().split("T")[0],
    impacts,
  };

  const outPath = path.join(DATA_DIR, "appellate-impacts.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ Saved ${impacts.length} impacts → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
