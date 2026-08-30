/**
 * backfill-oral-argument-transcripts.ts
 *
 * Resolves and populates public.oral_argument_transcripts for every argued
 * OT2025 case. Coverage as of writing: 35/66 cases already had a transcript
 * URL in cases.source_urls; the other 31 either never had oral argument
 * (sitting='no_argument', correctly skipped) or need their real transcript
 * URL resolved the same way Klein v. Martin's and Abouammo's slip-opinion
 * PDFs were resolved earlier this session -- via the live SCOTUS
 * oral-arguments listing, matched by docket number, not guessed.
 *
 * Run:  npx tsx scripts/backfill-oral-argument-transcripts.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { downloadPdf, extractText } from "./pipeline.js";
import { fetchTranscriptList } from "./backfill-key-exchanges.js";
import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, upsert } from "./lib/supabase-sync/client.js";

const CACHE_DIR = path.join(process.cwd(), ".cache", "oral-argument-transcripts");

interface CaseRow {
  id: string;
  slug: string;
  docket_number: string | null;
  sitting: string | null;
  argued_date: string | null;
  source_urls: string[] | null;
}

function transcriptUrlFromSourceUrls(urls: string[] | null): string | null {
  return (urls ?? []).find((u) => u.includes("argument_transcripts")) ?? null;
}

let listingCache: Awaited<ReturnType<typeof fetchTranscriptList>> | null = null;

async function resolveTranscriptUrl(docketNumber: string): Promise<string | null> {
  if (!listingCache) listingCache = await fetchTranscriptList("2025");
  const primaryDocket = docketNumber.replace(/\s*\(consolidated.*$/i, "").trim();
  const found = listingCache.find((t) => t.caseNumber === primaryDocket);
  return found?.transcriptUrl ?? null;
}

async function getTranscriptText(slug: string, url: string): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${slug}.txt`);
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, "utf-8");
  const buf = await downloadPdf(url);
  const text = await extractText(buf);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, text);
  return text;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const cases = await select<CaseRow>(
    creds,
    "cases",
    "?term=eq.2025&status=eq.decided&select=id,slug,docket_number,sitting,argued_date,source_urls",
  );

  const noArgument = cases.filter((c) => c.sitting === "no_argument");
  const argued = cases.filter((c) => c.sitting !== "no_argument");

  console.log(`${cases.length} decided OT2025 cases: ${noArgument.length} no_argument (skipped), ${argued.length} argued.\n`);

  const resolved: { case: CaseRow; url: string; source: "source_urls" | "live_listing" }[] = [];
  const notFound: CaseRow[] = [];

  for (const c of argued) {
    const existing = transcriptUrlFromSourceUrls(c.source_urls);
    if (existing) {
      resolved.push({ case: c, url: existing, source: "source_urls" });
      continue;
    }
    if (!c.docket_number) {
      notFound.push(c);
      continue;
    }
    const url = await resolveTranscriptUrl(c.docket_number);
    if (url) {
      resolved.push({ case: c, url, source: "live_listing" });
    } else {
      notFound.push(c);
    }
  }

  console.log(`Resolved: ${resolved.length} (${resolved.filter((r) => r.source === "source_urls").length} from source_urls, ${resolved.filter((r) => r.source === "live_listing").length} from live listing)`);
  console.log(`Not found: ${notFound.length}`);
  if (notFound.length) {
    for (const c of notFound) console.log(`  ${c.slug} (docket ${c.docket_number ?? "unknown"})`);
  }

  if (dryRun) {
    console.log("\n--dry-run: no fetch/writes performed.");
    return;
  }

  console.log("\nFetching transcripts...");
  const rows: Record<string, unknown>[] = [];
  const fetchFailed: { slug: string; url: string; error: string }[] = [];
  for (const { case: c, url } of resolved) {
    try {
      const text = await getTranscriptText(c.slug, url);
      rows.push({ case_id: c.id, transcript_text: text, source_url: url, argued_date: c.argued_date });
      console.log(`✓ ${c.slug}: ${text.length.toLocaleString()} chars`);
    } catch (err) {
      fetchFailed.push({ slug: c.slug, url, error: (err as Error).message });
      console.log(`✗ ${c.slug}: ${(err as Error).message}`);
    }
  }

  if (rows.length) {
    await upsert(creds, "oral_argument_transcripts", rows, "case_id");
  }

  console.log(`\n✓ Wrote ${rows.length} transcript(s). ${fetchFailed.length} fetch failure(s). ${notFound.length} case(s) had no resolvable URL.`);
  if (fetchFailed.length) {
    console.log("\nFETCH FAILURES:");
    for (const f of fetchFailed) console.log(`  ${f.slug}: ${f.error}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
