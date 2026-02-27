/**
 * fetch-analysis-articles.ts
 *
 * Fetches Supreme Court analysis articles from RSS feeds, summarises them
 * with Claude, and links them to relevant case slugs.
 * Saves to data/articles.json.
 *
 * Run: npx tsx scripts/fetch-analysis-articles.ts
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
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

const DATA_DIR  = path.join(process.cwd(), "data");
const CASES_DIR = path.join(DATA_DIR, "cases");
const OUT_PATH  = path.join(DATA_DIR, "articles.json");

const RSS_FEEDS = [
  { source: "SCOTUSblog",           domain: "scotusblog.com",      url: "https://www.scotusblog.com/feed/",                                       trustAll: true  },
  { source: "The Atlantic",         domain: "theatlantic.com",     url: "https://www.theatlantic.com/feed/all/",                                  trustAll: false },
  { source: "The New Yorker",       domain: "newyorker.com",       url: "https://www.newyorker.com/feed/everything",                              trustAll: false },
  { source: "NY Mag Intelligencer", domain: "nymag.com",           url: "https://nymag.com/feeds/intelligencer.rss",                              trustAll: false },
  { source: "NYT Politics",         domain: "nytimes.com",         url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",               trustAll: false },
  { source: "NYT Opinion",          domain: "nytimes.com",         url: "https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml",                trustAll: false },
  { source: "Washington Post",      domain: "washingtonpost.com",  url: "https://feeds.washingtonpost.com/rss/politics",                          trustAll: false },
  { source: "The Dispatch",         domain: "thedispatch.com",     url: "https://thedispatch.com/feed/",                                          trustAll: false },
  { source: "Financial Times",      domain: "ft.com",              url: "https://www.ft.com/?format=rss",                                         trustAll: false },
];

// Phrases that unambiguously indicate an article is about the Supreme Court.
// These must appear in the article TITLE (not just a passing mention in the description).
// "justice" alone matches "Justice Department"; "court" alone matches any court;
// individual last names match unrelated people. Only exact multi-word phrases are used.
const STRONG_SCOTUS_PHRASES = [
  "supreme court",
  "scotus",
  "certiorari",
  "cert. granted",
  "cert. denied",
  "cert granted",
  "cert denied",
  "oral argument",
  "chief justice",
  "john roberts",     // commonly referenced without "Chief Justice" prefix
  "justice alito",
  "justice thomas",
  "justice sotomayor",
  "justice kagan",
  "justice gorsuch",
  "justice kavanaugh",
  "justice barrett",
  "justice jackson",
  "justice roberts",
];

const MAX_AGE_DAYS = 90;
const BATCH_SIZE   = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceDomain: string;
  publishedAt: string;
  author?: string;
  summary: string;
  relatedCaseSlugs: string[];
}

interface ArticlesData {
  generated: string;
  articles: Article[];
}

interface RawItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceDomain: string;
  publishedAt: string;
  author: string;
  description: string;
}

// ── RSS Parsing ───────────────────────────────────────────────────────────────

function extractCdata(raw: string): string {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : raw.trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // ISO 8601 — just take the date part
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // RFC 2822: "Thu, 27 Feb 2026 12:00:00 +0000"
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return null;
}

function extractTag(xml: string, tag: string): string {
  // Handles both <tag>value</tag> and <tag><![CDATA[value]]></tag>
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return extractCdata(m[1]).trim();
}

function extractAuthor(block: string): string {
  // dc:creator is the standard for NYT, WaPo, SCOTUSblog
  const dcCreator = extractTag(block, "dc:creator");
  if (dcCreator) return stripHtml(dcCreator).trim();

  // Atom: <author><name>...</name></author>
  const authorBlockMatch = block.match(/<author>([\s\S]*?)<\/author>/i);
  if (authorBlockMatch) {
    const name = extractTag(authorBlockMatch[1], "name");
    if (name) return stripHtml(extractCdata(name)).trim();
    // Plain RSS 2.0 author — may be "email@domain (Display Name)" or just a name
    const plain = stripHtml(extractCdata(authorBlockMatch[1])).trim();
    const parenName = plain.match(/\(([^)]+)\)/);
    if (parenName) return parenName[1].trim();
    // Skip bare email addresses
    if (/^[^\s@]+@[^\s@]+$/.test(plain)) return "";
    return plain;
  }

  return "";
}

function makeId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

function parseRssFeed(
  xml: string,
  source: string,
  domain: string,
): RawItem[] {
  const items: RawItem[] = [];

  // Match both <item> (RSS) and <entry> (Atom)
  const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];

    const title = stripHtml(extractCdata(extractTag(block, "title") || ""));
    if (!title) continue;

    // URL: <link>, or Atom <link href="...">
    let url = extractTag(block, "link");
    if (!url) {
      const linkHref = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkHref) url = linkHref[1];
    }
    url = url.trim();
    if (!url || !url.startsWith("http")) continue;

    // Published date: <pubDate>, <published>, or <updated>
    const rawDate =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "updated");
    const publishedAt = parseDate(rawDate);
    if (!publishedAt) continue;

    // Author
    const author = extractAuthor(block);

    // Description / summary
    const rawDesc =
      extractTag(block, "description") ||
      extractTag(block, "summary") ||
      extractTag(block, "content:encoded") ||
      "";
    const description = stripHtml(extractCdata(rawDesc)).slice(0, 500);

    const id = makeId(url);

    items.push({ id, title, url, source, sourceDomain: domain, publishedAt, author, description });
  }

  return items;
}

function isScotusRelevant(item: RawItem, _caseTitleWords: string[]): boolean {
  // Require a strong SCOTUS phrase in the article TITLE.
  // Description-only matches produce too many false positives: general political feeds
  // routinely mention "supreme court" or case party words in passing.
  // SCOTUSblog (trustAll: true) is the authoritative per-case source; other outlets
  // writing about a specific SCOTUS case will always name the court in the headline.
  const titleLower = item.title.toLowerCase();
  return STRONG_SCOTUS_PHRASES.some((kw) => titleLower.includes(kw));
}

// ── Load case context ─────────────────────────────────────────────────────────

interface CaseContext {
  slug: string;
  title: string;
  termYear: string;
}

function loadCases(): CaseContext[] {
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  const results: CaseContext[] = [];
  for (const f of files) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), "utf-8"));
      if (d.termYear !== "2025") continue;
      results.push({ slug: d.slug, title: d.title, termYear: d.termYear });
    } catch { /* skip */ }
  }
  return results;
}

// ── Fetch RSS ─────────────────────────────────────────────────────────────────

async function fetchFeed(
  feedUrl: string,
  source: string,
  domain: string,
): Promise<RawItem[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "SupremeCourtWiki/1.0 (+https://github.com/supreme-court-wiki)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`  ✗ ${source}: HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseRssFeed(xml, source, domain);
  } catch (err) {
    console.warn(`  ✗ ${source}: ${err}`);
    return [];
  }
}

// ── Claude summarisation ──────────────────────────────────────────────────────

interface SummaryResult {
  summary: string;
  relatedCaseSlugs: string[];
}

async function summariseBatch(
  items: RawItem[],
  caseContexts: CaseContext[],
  client: Anthropic,
): Promise<SummaryResult[]> {
  const caseList = caseContexts
    .map((c) => `• ${c.slug} — ${c.title}`)
    .join("\n");

  const articleBlocks = items
    .map(
      (item, i) =>
        `--- Article ${i + 1} ---\n` +
        `Source: ${item.source}\n` +
        `Title: ${item.title}\n` +
        `Published: ${item.publishedAt}\n` +
        `Description: ${item.description}\n`,
    )
    .join("\n");

  const prompt = `You are an expert legal journalist summarising Supreme Court news articles for a public tracker.

For each article below, write:
1. A 2–3 sentence plain-English summary of the article's key point about the Supreme Court.
2. A list of case slugs from the SCOTUS cases list that this article directly discusses (empty array if none match).

Current 2025-term SCOTUS cases (slug — title):
${caseList}

Return ONLY a valid JSON array (no prose, no markdown fences). Each element must be:
{
  "summary": "2–3 sentence summary",
  "relatedCaseSlugs": ["slug-1", "slug-2"]
}

The array must have exactly ${items.length} elements, in the same order as the articles.

Articles:
${articleBlocks}`;

  console.log(`  Sending ${items.length} articles to Claude...`);
  const msg = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

  // Extract outermost JSON array using bracket counting
  const jsonStart = raw.indexOf("[");
  if (jsonStart === -1) {
    console.warn("  Claude returned no JSON array");
    return items.map(() => ({ summary: "", relatedCaseSlugs: [] }));
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
    return items.map(() => ({ summary: "", relatedCaseSlugs: [] }));
  }

  try {
    const parsed: SummaryResult[] = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    while (parsed.length < items.length) {
      parsed.push({ summary: "", relatedCaseSlugs: [] });
    }
    return parsed.slice(0, items.length);
  } catch (err) {
    console.warn("  JSON parse error:", err);
    return items.map(() => ({ summary: "", relatedCaseSlugs: [] }));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Fetching Analysis Articles ===\n");

  // Load existing articles for dedup
  let existing: ArticlesData = { generated: "", articles: [] };
  try {
    existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
  } catch { /* fresh start */ }

  const existingIds = new Set(existing.articles.map((a) => a.id));
  const existingUrls = new Set(existing.articles.map((a) => a.url));

  // Load case context
  const caseContexts = loadCases();
  console.log(`Loaded ${caseContexts.length} 2025-term cases for context\n`);

  const validSlugs = new Set(caseContexts.map((c) => c.slug));

  // Cutoff date
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  // Fetch all RSS feeds
  const candidateItems: RawItem[] = [];
  for (const feed of RSS_FEEDS) {
    console.log(`Fetching ${feed.source}...`);
    const items = await fetchFeed(feed.url, feed.source, feed.domain);
    console.log(`  ${items.length} items parsed`);

    // SCOTUSblog: trust all articles; others: require SCOTUS relevance check
    const relevant = feed.trustAll
      ? items
      : items.filter((item) => isScotusRelevant(item, []));
    console.log(`  ${relevant.length} SCOTUS-relevant`);
    candidateItems.push(...relevant);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nTotal SCOTUS-relevant items: ${candidateItems.length}`);

  // Filter: age and dedup against existing
  const newItems = candidateItems.filter((item) => {
    if (item.publishedAt < cutoffStr) return false;
    if (existingIds.has(item.id)) return false;
    if (existingUrls.has(item.url)) return false;
    return true;
  });

  console.log(`New items (not yet in DB): ${newItems.length}`);

  if (newItems.length === 0) {
    console.log("\nNo new articles to process.");
  }

  // Dedupe by id within newItems
  const deduped = [...new Map(newItems.map((i) => [i.id, i])).values()];

  // Summarise in batches
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const summarised: Article[] = [];

  for (let offset = 0; offset < deduped.length; offset += BATCH_SIZE) {
    const batch = deduped.slice(offset, offset + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(offset / BATCH_SIZE) + 1}: ${batch.length} articles`);
    try {
      const results = await summariseBatch(batch, caseContexts, client);
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const result = results[i];
        // Validate slugs
        const relatedCaseSlugs = (result.relatedCaseSlugs ?? []).filter(
          (s) => validSlugs.has(s),
        );
        if (!result.summary) {
          console.warn(`  ✗ No summary for: ${item.title.slice(0, 60)}`);
          continue;
        }
        const article: Article = {
          id: item.id,
          title: item.title,
          url: item.url,
          source: item.source,
          sourceDomain: item.sourceDomain,
          publishedAt: item.publishedAt,
          summary: result.summary,
          relatedCaseSlugs,
        };
        if (item.author) article.author = item.author;
        summarised.push(article);
        console.log(
          `  ✓ ${item.title.slice(0, 60)}` +
            (item.author ? ` (${item.author})` : "") +
            (relatedCaseSlugs.length ? ` [${relatedCaseSlugs.join(", ")}]` : ""),
        );
      }
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err}`);
    }
  }

  // Merge with existing, sort by date desc, drop articles older than cutoff
  const merged = [...existing.articles, ...summarised].filter(
    (a) => a.publishedAt >= cutoffStr,
  );

  // Dedupe by id
  const mergedMap = new Map(merged.map((a) => [a.id, a]));
  const final = [...mergedMap.values()].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  const output: ArticlesData = {
    generated: new Date().toISOString().split("T")[0],
    articles: final,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Saved ${final.length} articles → ${OUT_PATH}`);
  console.log(`  (${summarised.length} new this run)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
