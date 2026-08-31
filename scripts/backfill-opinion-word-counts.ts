/**
 * backfill-opinion-word-counts.ts
 *
 * Populates opinions.word_count for every decided OT2025 opinion row.
 * Downloads each case's slip-opinion PDF, segments it into per-opinion text
 * blocks (majority / plurality / per curiam / concurrence / concurrence in
 * judgment / concurrence in part / concur_dissent / dissent in part /
 * dissent), matches each opinions row to the block it corresponds to, and
 * writes the cleaned word count.
 *
 * Validated by hand against Feldman's "Final Stat Pack 2025-26 term.pdf"
 * (9-justice + per curiam average word counts against the ±1.7% bar, plus
 * specific case-level ground truth: Chatrie/Barrett dissent ≈60 words,
 * Barbara/Thomas dissent ≈29,400, Learning Resources/Kavanaugh dissent
 * ≈19,000, Learning Resources/Gorsuch concurrence ≈14,700, Callais/Kagan
 * dissent ≈16,000, Slaughter/Sotomayor dissent ≈15,900) before being ported
 * here from scratch prototyping. See docs/term-stats-coding-rules.md §10a
 * for the fractured-opinion dedup rule this script also applies.
 *
 * Run:  npx tsx scripts/backfill-opinion-word-counts.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { downloadPdf, extractText } from "./pipeline.js";
import { fetchSlipOpinions } from "./fetch-opinion-authors.js";
import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, update } from "./lib/supabase-sync/client.js";

const CACHE_DIR = path.join(process.cwd(), ".cache", "opinion-pdf-text");

// ---------------------------------------------------------------------------
// Justice identity — DB person.slug -> the all-caps surname used in slip
// opinions. Kept as an explicit small map rather than parsed from
// full_name: "John G. Roberts Jr." / "Amy Coney Barrett" / "Ketanji Brown
// Jackson" don't reduce to their opinion-heading surname by any single
// trimming rule that wouldn't also risk mis-parsing a future addition.
// ---------------------------------------------------------------------------

const JUSTICE_LAST_NAME_BY_SLUG: Record<string, string> = {
  "john-roberts": "ROBERTS",
  "clarence-thomas": "THOMAS",
  "samuel-alito": "ALITO",
  "sonia-sotomayor": "SOTOMAYOR",
  "elena-kagan": "KAGAN",
  "neil-gorsuch": "GORSUCH",
  "brett-kavanaugh": "KAVANAUGH",
  "amy-coney-barrett": "BARRETT",
  "ketanji-brown-jackson": "JACKSON",
};

// ---------------------------------------------------------------------------
// Text cleaning — strip slip-opinion page furniture from one opinion's raw
// text block, return (cleaned, wordCount).
// ---------------------------------------------------------------------------

function cleanAndCount(rawBlock: string): { cleaned: string; wordCount: number } {
  let t = rawBlock;

  // Page-break furniture: "-- N of M --" + the page-number/caption line +
  // running-head line right after it.
  t = t.replace(/--\s*\d+\s+of\s+\d+\s*--\s*\n?\d*[^\n]*\n[^\n]*\n?/g, " ");
  // Trailing page marker with nothing after it — happens when a block ends
  // on the very last page of a document, so there's no following
  // page-number/caption/running-head line for the pattern above to consume.
  t = t.replace(/--\s*\d+\s+of\s+\d+\s*--\s*$/, " ");

  // "Cite as: 609 U. S. ____ (2026)" running footer/header, with an
  // optional leading/trailing page number, appears on every page.
  t = t.replace(/\d*\s*Cite as:\s*\d+\s*U\.\s*S\.\s*____?\s*\(\d{4}\)\s*\d*/g, " ");

  // The opinion-type running head repeated on every page (e.g. "Opinion of
  // the Court", "BARRETT, J., dissenting", "GORSUCH, J., concurring in
  // judgment") -- matches a short standalone line ending in one of these
  // role words, not embedded in a longer sentence.
  t = t.replace(
    /^\s*(?:Opinion of the Court|[A-Z][A-Za-z .]*,\s*J\.,\s*(?:concurring(?: in (?:the )?judgment)?(?: and dissenting in part)?|dissenting(?: in part)?))\s*$/gm,
    " ",
  );

  // Caption block at the top of each opinion: court name, docket line,
  // "ON WRIT OF CERTIORARI...", bracketed decision date, and the NOTICE
  // disclaimer (majority only). Also strips the case caption itself, which
  // repeats verbatim at the top of every opinion block as running-head
  // furniture, not substantive text.
  t = t.replace(/SUPREME COURT OF THE UNITED STATES/g, " ");
  t = t.replace(/No\.\s*\d+[–A-Za-z-]*\d*/g, " ");
  t = t.replace(/ON WRIT OF CERTIORARI TO[^[]*?(?=\[|\n\n|[A-Z][a-z]+ing)/g, " ");
  t = t.replace(/\[[A-Z][a-z]+ \d{1,2}, \d{4}\]/g, " ");
  // [\s\S] instead of the dotAll flag's "." -- keeps this valid under the
  // project's ES2017 tsconfig target (dotAll needs ES2018+) while matching
  // across newlines exactly the same way.
  t = t.replace(/NOTICE:[\s\S]*?formal errors\./g, " ");
  // Multi-line-safe: caption text wraps across lines in the extracted text,
  // up to the point the actual opinion author-line begins.
  t = t.replace(
    /^\s*[A-Z][A-Z0-9 .,'&\-\n]{3,300}?\bv\.\s*[A-Z][A-Z0-9 .,'&\-\n]{2,300}?(?=\s*J\s?USTICE|\s*PER\s+CURIAM)/,
    " ",
  );

  const words = t.split(/\s+/).filter(Boolean);
  return { cleaned: words.join(" "), wordCount: words.length };
}

// ---------------------------------------------------------------------------
// Segmentation — split full extracted PDF text into (header, block) pairs,
// one per opinion, using the double-underscore-rule separator (or the
// equivalent page-1-reset-with-no-separator shape for short per-curiam-only
// documents) that marks the start of each new opinion in the slip-opinion
// body.
// ---------------------------------------------------------------------------

const OPINION_BODY_START_RE = /NOTICE:\s*This opinion is subject to formal revision/;

const HEADER_RE = new RegExp(
  "(Opinion of the Court|PER CURIAM|" +
    "[A-Z][A-Za-z .]*,\\s*J\\.,\\s*" +
    "(?:concurring(?: in (?:the )?judgment)?(?: in part)?(?: and dissenting in part)?" +
    "|dissenting(?: in part)?))",
);

interface Block {
  header: string;
  text: string;
}

function segment(rawTextIn: string): Block[] {
  // Dehyphenate line-wrapped words BEFORE splitting/matching -- e.g.
  // "con-\ncurring" must read as "concurring" or the header/authorship
  // regexes below silently fail to recognize it (found via Cisco Systems
  // v. Doe I's "con-\ncurring in judgment in part" header). Same technique
  // used in fetch-opinion-authors.ts for the same underlying PDF-
  // extraction artifact.
  const rawText = rawTextIn.replace(/(\w)-\n\s*(\w)/g, "$1$2");

  const combinedRe = /(?:\n_{5,}\n_{5,}\n)|(?:--\s*\d+\s+of\s+\d+\s*--\s*\n+\s*1\s*Cite as:)/;
  const parts = rawText.split(combinedRe);

  const opinions: Block[] = [];
  const first = parts[0];
  const noticeMatch = OPINION_BODY_START_RE.exec(first);
  if (noticeMatch) {
    // Real syllabus present: everything after the NOTICE boilerplate within
    // part[0] is the majority (or per curiam) opinion itself.
    const body = first.slice(noticeMatch.index + noticeMatch[0].length);
    const m = HEADER_RE.exec(body);
    const header = m ? m[1].trim() : "Opinion of the Court";
    opinions.push({ header, text: body });
  } else {
    // No NOTICE/syllabus marker in part[0] at all. For a FULL merits case
    // this correctly means part[0] is pure syllabus (its own "delivered the
    // opinion..." announcement and citation-style "(X, J., concurring)"
    // parentheticals must NOT be mistaken for a real opinion start -- hence
    // the narrow, paren-excluding PER CURIAM check here rather than the
    // broader HEADER_RE). For a short per-curiam-only document, part[0]
    // genuinely IS that opinion, always announced as a real "PER CURIAM ."
    // (never parenthesized the way a citation to another case's per curiam
    // disposition would be).
    if (/(?<!\()\bP\s?ER CURIAM\s*\.(?!\))/.test(first)) {
      opinions.push({ header: "PER CURIAM", text: first });
    }
  }

  for (const block of parts.slice(1)) {
    const m = HEADER_RE.exec(block);
    const header = m ? m[1].trim() : "UNKNOWN";
    opinions.push({ header, text: block });
  }
  return opinions;
}

// ---------------------------------------------------------------------------
// Justice-to-block matching
// ---------------------------------------------------------------------------

function nameMatches(header: string, justiceLastName: string): boolean {
  // PDF extraction sometimes inserts a stray space inside the surname
  // (e.g. "T HOMAS", "G ORSUCH", "K AVANAUGH") -- strip all whitespace
  // before comparing so this doesn't cause a false negative.
  const h = header.replace(/\s+/g, "").toUpperCase();
  return h.includes(justiceLastName.toUpperCase());
}

/**
 * Collapse the PDF mid-word-space artifact in the opening of a block before
 * running name regexes over it. The artifact doesn't just hit surnames
 * ("T HOMAS", "K AVANAUGH") -- it hits "JUSTICE" itself ("J USTICE
 * J ACKSON"), which breaks a naive name-capture regex: "J USTICE J ACKSON"
 * has no contiguous 2+ letter run right after "USTICE ", so the whole
 * mention gets skipped and the first REAL match ends up being a later,
 * uncorrupted joiner name instead (Cisco Systems: "J USTICE J ACKSON, WITH
 * WHOM JUSTICE KAGAN JOINS" would otherwise skip Jackson and match Kagan
 * first). Fix: merge any standalone single capital letter immediately
 * followed by whitespace and 2+ more capital letters -- this only fires on
 * the artifact shape (a lone one-letter "word" glued to whitespace with no
 * period), never on real abbreviations like "U. S." or "NO." which always
 * have a period before the space.
 */
function normalizeOpening(block: string): string {
  let opening = block.slice(0, 600).replace(/\s+/g, " ").toUpperCase();
  opening = opening.replace(/\b([A-Z])\s(?=[A-Z]{2,})/g, "$1");
  return opening;
}

/**
 * Requires the target justice to be the FIRST "JUSTICE X" mention in the
 * block, not just present anywhere -- a joint opinion's header ("JUSTICE
 * SOTOMAYOR, with whom JUSTICE KAGAN and JUSTICE JACKSON join, ...")
 * mentions every joiner by name too, and a case caption can itself contain
 * a justice's surname as a party name (B.P.J.'s own caption includes
 * "...next friend and mother, HEATHER JACKSON") -- neither should
 * false-match. Only the actual first-named author should.
 */
function blockAuthoredBy(block: string, justiceLastName: string): boolean {
  const opening = normalizeOpening(block);
  const re = /JUSTICE\s+([A-Z]+)\b|\b([A-Z]+)\s*,\s*J\.,/g;
  const m = re.exec(opening);
  if (!m) return false;
  const firstName = m[1] || m[2];
  return firstName === justiceLastName.toUpperCase();
}

/**
 * A joining justice (e.g. Jackson in B.P.J., who only joins Sotomayor's
 * opinion and has no separately-headed text of her own) gets their own
 * `opinions` row in the DB pointing at the SAME physical document as the
 * primary author -- same pattern as the §10a dedup convention for one
 * author with multiple rows, just across two different authors here.
 * Detect this by checking for the justice's name inside a "with whom ...
 * join(s)" clause in the block's opening.
 */
function blockJoinedBy(block: string, justiceLastName: string): boolean {
  const opening = normalizeOpening(block);
  const m = /WITH WHOM([\s\S]*?)JOINS?\b/.exec(opening);
  if (!m) return false;
  const clause = m[1];
  const names = [...clause.matchAll(/JUSTICE\s+([A-Z]+)\b/g)].map((mm) => mm[1]);
  return names.includes(justiceLastName.toUpperCase());
}

type MatchStatus =
  | { ok: true; header: string; wordCount: number; fullText: string }
  | { ok: false; reason: string };

function matchOpinionToBlock(
  kind: string,
  justiceLastName: string | null,
  blocks: Block[],
): MatchStatus {
  if (blocks.length === 0) return { ok: false, reason: "NO_BLOCKS_FOUND" };

  let target: Block | null = null;

  if (kind === "majority") {
    // Majority is always the first block after the syllabus.
    target = blocks[0];
  } else if (kind === "per_curiam") {
    target =
      blocks.find((b) => b.header.toUpperCase().includes("PER CURIAM") || b.header === "Opinion of the Court") ??
      blocks[0];
  } else if (justiceLastName) {
    target =
      blocks.find((b) => nameMatches(b.header, justiceLastName) || blockAuthoredBy(b.text, justiceLastName)) ?? null;
    if (!target) {
      // No block independently authored by this justice -- check whether
      // they're a named joiner on someone else's opinion (e.g. Jackson
      // joining Sotomayor's B.P.J. concur/dissent). Same physical text, so
      // same word count, per the §10a multi-row-same-document convention.
      target = blocks.find((b) => blockJoinedBy(b.text, justiceLastName)) ?? null;
    }
  }

  if (!target) {
    return { ok: false, reason: `NO_MATCHING_BLOCK (found headers: ${blocks.map((b) => b.header).join(", ")})` };
  }
  const { cleaned, wordCount } = cleanAndCount(target.text);
  return { ok: true, header: target.header, wordCount, fullText: cleaned };
}

// ---------------------------------------------------------------------------
// §10a dedup — an author can have multiple opinions rows for the same case
// (a fractured opinion split into majority + plurality parts). For
// word-count purposes only the highest-priority kind gets a real value;
// the rest are explicitly null (not "extraction failed" -- deliberately
// excluded, since it's the same physical text as the row that does carry
// the count). Priority order matches term-stats-feldman-check.ts's
// KIND_PRIORITY exactly (majority > plurality verified against Feldman's
// own table; the rest is an unverified placeholder — see coding rules §10a).
// ---------------------------------------------------------------------------

const KIND_PRIORITY = [
  "majority",
  "plurality",
  "per_curiam",
  "concur_dissent",
  "concurrence",
  "concurrence_in_judgment",
  "concurrence_in_part",
  "dissent",
  "dissent_in_part",
];
const KIND_RANK = new Map(KIND_PRIORITY.map((k, i) => [k, i]));

// ---------------------------------------------------------------------------
// PDF text acquisition — cached locally (gitignored) to avoid re-downloading
// on every run. Primary source is data/cases/<slug>.json's `outcome` field
// (populated by fetch-opinion-authors.ts's normal flow); cases backfilled
// outside that flow (no data/cases/*.json file — e.g. Clark v. Sweeney)
// fall back to the live SCOTUS slip-opinions listing, matched by docket
// number.
// ---------------------------------------------------------------------------

function pdfUrlFromCaseJson(slug: string): string | null {
  const filePath = path.join(process.cwd(), "data", "cases", `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { outcome?: string };
    const m = /https?:\/\/\S+?\.pdf/.exec(data.outcome ?? "");
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

let slipOpinionsCache: Awaited<ReturnType<typeof fetchSlipOpinions>> | null = null;

async function pdfUrlFromSlipListing(docketNumber: string): Promise<string | null> {
  // Slip opinions are grouped under the ARGUMENT term's two-digit year;
  // OT2025 cases were argued/decided in the 25 listing.
  if (!slipOpinionsCache) slipOpinionsCache = await fetchSlipOpinions("25");
  const primaryDocket = docketNumber.replace(/\s*\(consolidated.*$/i, "").trim();
  const found = slipOpinionsCache.find((o) => o.caseNumber === primaryDocket);
  return found?.pdfUrl ?? null;
}

async function getCaseText(slug: string, docketNumber: string | null): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${slug}.txt`);
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, "utf-8");

  const url = pdfUrlFromCaseJson(slug) ?? (docketNumber ? await pdfUrlFromSlipListing(docketNumber) : null);
  if (!url) throw new Error(`no PDF URL found for ${slug} (docket ${docketNumber ?? "unknown"})`);

  const buf = await downloadPdf(url);
  const text = await extractText(buf);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, text);
  return text;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface CaseRow {
  id: string;
  slug: string;
  docket_number: string | null;
}
interface PersonRow {
  id: string;
  slug: string;
}
interface OpinionRow {
  id: string;
  case_id: string;
  kind: string;
  author_id: string | null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const [cases, people, opinions] = await Promise.all([
    select<CaseRow>(creds, "cases", "?term=eq.2025&status=eq.decided&select=id,slug,docket_number"),
    select<PersonRow>(creds, "people", "?select=id,slug"),
    // No cases.term=eq.2025 filter on this embed applies to the parent
    // table directly, so filter opinions via the cases!inner embed instead.
    select<OpinionRow & { cases: { term: string; status: string } }>(
      creds,
      "opinions",
      "?select=id,case_id,kind,author_id,cases!inner(term,status)&cases.term=eq.2025&cases.status=eq.decided",
    ),
  ]);

  const caseById = new Map(cases.map((c) => [c.id, c]));
  const lastNameByPersonId = new Map<string, string>();
  for (const p of people) {
    const last = JUSTICE_LAST_NAME_BY_SLUG[p.slug];
    if (last) lastNameByPersonId.set(p.id, last);
  }

  console.log(`Found ${opinions.length} opinion rows across ${cases.length} decided OT2025 cases.\n`);

  // §10a: determine, per (case_id, author_id) with >1 row, which single
  // row is the highest-priority kind and therefore eligible for a real
  // word count. Rows with a unique (case_id, author_id) are unaffected.
  const rowsByCaseAuthor = new Map<string, OpinionRow[]>();
  for (const o of opinions) {
    if (!o.author_id) continue; // per curiam — never deduped
    const key = `${o.case_id}::${o.author_id}`;
    if (!rowsByCaseAuthor.has(key)) rowsByCaseAuthor.set(key, []);
    rowsByCaseAuthor.get(key)!.push(o);
  }
  const dedupNullIds = new Set<string>();
  for (const rows of rowsByCaseAuthor.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => (KIND_RANK.get(a.kind) ?? 99) - (KIND_RANK.get(b.kind) ?? 99));
    for (const loser of sorted.slice(1)) dedupNullIds.add(loser.id);
  }
  if (dedupNullIds.size) {
    console.log(`§10a dedup: ${dedupNullIds.size} row(s) will be left null (same physical text as a higher-priority row):`);
    for (const id of dedupNullIds) {
      const o = opinions.find((op) => op.id === id)!;
      const c = caseById.get(o.case_id)!;
      console.log(`  ${c.slug} (${o.kind}, id=${id})`);
    }
    console.log();
  }

  const populated: { id: string; slug: string; kind: string; wordCount: number; fullText: string }[] = [];
  const failed: { id: string; slug: string; kind: string; reason: string }[] = [];

  const byCaseId = new Map<string, OpinionRow[]>();
  for (const o of opinions) {
    if (!byCaseId.has(o.case_id)) byCaseId.set(o.case_id, []);
    byCaseId.get(o.case_id)!.push(o);
  }

  for (const [caseId, rows] of byCaseId) {
    const c = caseById.get(caseId);
    if (!c) continue;

    let text: string;
    try {
      text = await getCaseText(c.slug, c.docket_number);
    } catch (err) {
      for (const o of rows) {
        if (dedupNullIds.has(o.id)) continue;
        failed.push({ id: o.id, slug: c.slug, kind: o.kind, reason: `PDF fetch failed: ${(err as Error).message}` });
      }
      console.log(`✗ ${c.slug}: ${(err as Error).message}`);
      continue;
    }

    const blocks = segment(text);

    for (const o of rows) {
      if (dedupNullIds.has(o.id)) continue; // left null by design
      const justiceLastName = o.author_id ? lastNameByPersonId.get(o.author_id) ?? null : null;
      const result = matchOpinionToBlock(o.kind, justiceLastName, blocks);
      if (result.ok) {
        populated.push({ id: o.id, slug: c.slug, kind: o.kind, wordCount: result.wordCount, fullText: result.fullText });
      } else {
        failed.push({ id: o.id, slug: c.slug, kind: o.kind, reason: result.reason });
      }
    }
    console.log(`✓ ${c.slug}: ${blocks.length} block(s) segmented`);
  }

  console.log(`\n${populated.length} opinion(s) ready to write, ${failed.length} failed extraction, ${dedupNullIds.size} left null by §10a dedup.`);

  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  ${f.slug} (${f.kind}, id=${f.id}): ${f.reason}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  console.log("\nWriting word_count + full_text...");
  let written = 0;
  for (const p of populated) {
    await update(creds, "opinions", `id=eq.${p.id}`, { word_count: p.wordCount, full_text: p.fullText });
    written++;
  }
  // §10a-excluded rows are written explicitly to null too, so a rerun is
  // idempotent even if a prior partial run (or manual edit) left a stale
  // non-null value on one of them.
  for (const id of dedupNullIds) {
    await update(creds, "opinions", `id=eq.${id}`, { word_count: null, full_text: null });
  }
  console.log(`✓ Wrote word_count + full_text for ${written} row(s); explicitly nulled ${dedupNullIds.size} §10a-excluded row(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
