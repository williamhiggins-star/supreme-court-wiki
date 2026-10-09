/**
 * read-order-lists.ts — records what the Court did in its orders, from the
 * Orders of the Court listing (/orders/ordersofthecourt/{YY}) and each
 * order PDF on it, into court_actions: cert grants (incl. limited grants
 * and probable jurisdiction noted), denials, grants-vacated-remanded, and
 * summary dispositions by per curiam (also recorded in
 * summary_reversals_without_argument, not in cases). OT2026 on only.
 *
 * Writes the database only; nothing here is shown on the site.
 *
 * Each run reads the listing (If-Modified-Since the last complete run),
 * then only order PDFs no earlier run has recorded. Runs are logged in
 * ingest_runs (stats.job = "order_lists") with every PDF they recorded.
 *
 * Kill switch: COURT_ORDERS_OFF=1 (a GitHub repository variable in the
 * daily workflow) skips the step before any request.
 *
 * Needs `pdftotext` (poppler-utils).
 *
 * Run:  npx tsx scripts/read-order-lists.ts
 */

import { createHash } from "crypto";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getCredentials, type SupabaseCredentials } from "./lib/sd-db/env.js";
import { insert, select, update, upsert } from "./lib/sd-db/client.js";
import { currentTermYear } from "./lib/sd-db/constants.js";
import { reportSdWriteFailure } from "./lib/sd-db/failures.js";
import { CourtFetcher, CourtFetchHalt } from "./lib/court-orders/fetch.js";
import { parseOrderText, parseOrdersListing, type ParsedAction } from "./lib/court-orders/parse.js";

const FIRST_TERM = 2026; // no history before OT2026
const MAX_REQUESTS_PER_RUN = 40;

interface RecordedDocument {
  url: string;
  sha256: string;
  orderDate: string | null;
  actions: number;
}

interface RunStats {
  job: "order_lists";
  term: string;
  listingLastModified?: string | null;
  /** True once every PDF on the listing has been recorded. */
  complete?: boolean;
  documents: RecordedDocument[];
  requests?: number;
  halted?: string;
}

function pdfToText(pdf: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "order-"));
  try {
    const file = path.join(dir, "order.pdf");
    fs.writeFileSync(file, pdf);
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function writeActions(
  creds: SupabaseCredentials,
  term: string,
  url: string,
  sha256: string,
  actions: ParsedAction[],
): Promise<void> {
  // One row per (docket, action, date): a repeat within a batch would make
  // the upsert fail.
  const unique = [...new Map(actions.map((a) => [`${a.docketNumber}|${a.action}|${a.actionDate}`, a])).values()];
  const rows = unique.map((a) => ({
    docket_number: a.docketNumber,
    action: a.action,
    action_date: a.actionDate,
    term,
    court_text: a.courtText,
    source_url: url,
    source_sha256: sha256,
  }));
  const written = await upsert<{ id: string; docket_number: string; action: string; action_date: string }>(
    creds,
    "court_actions",
    rows,
    "docket_number,action,action_date",
  );

  const reversals = written.filter((r) => r.action === "summary_disposition");
  if (reversals.length > 0) {
    await upsert(
      creds,
      "summary_reversals_without_argument",
      reversals.map((r) => ({ docket_number: r.docket_number, term, decided_date: r.action_date, court_action_id: r.id })),
      "docket_number",
    );
    for (const r of reversals) {
      console.log(`::notice title=Summary disposition recorded::${r.docket_number}, decided ${r.action_date} (OT${term})`);
    }
  }
}

async function main() {
  if (process.env.COURT_ORDERS_OFF === "1") {
    console.log("[orders] COURT_ORDERS_OFF=1: skipped, no requests made.");
    return;
  }
  const creds = getCredentials();
  if (!creds) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");

  const term = currentTermYear();
  if (Number(term) < FIRST_TERM) {
    console.log(`[orders] OT${term} is before OT${FIRST_TERM}: nothing to read.`);
    return;
  }
  const yy = term.slice(2);

  const previous = await select<{ stats: RunStats }>(
    creds,
    "ingest_runs",
    `?select=stats&stats->>job=eq.order_lists&stats->>term=eq.${term}&order=started_at.desc`,
  );
  const recorded = new Set(previous.flatMap((r) => r.stats.documents ?? []).map((d) => d.url));
  const lastComplete = previous.find((r) => r.stats.complete);

  const stats: RunStats = { job: "order_lists", term, documents: [] };
  const [run] = await insert<{ id: string }>(creds, "ingest_runs", [{ status: "running", stats }]);
  const fetcher = new CourtFetcher(MAX_REQUESTS_PER_RUN);
  let status: "succeeded" | "failed" = "succeeded";

  try {
    const listingUrl = `https://www.supremecourt.gov/orders/ordersofthecourt/${yy}`;
    const listing = await fetcher.get(listingUrl, lastComplete?.stats.listingLastModified);
    if (listing.status === 304) {
      console.log(`[orders] ${listingUrl}: not modified since the last complete run.`);
      stats.listingLastModified = lastComplete?.stats.listingLastModified;
      stats.complete = true;
    } else {
      const toRead = parseOrdersListing(listing.body.toString("utf8"))
        .filter((o) => !recorded.has(o.url))
        .reverse(); // oldest first
      console.log(`[orders] OT${term}: ${toRead.length} order PDF(s) not yet recorded.`);

      let allRecorded = true;
      for (const order of toRead) {
        const pdf = await fetcher.get(order.url);
        const sha256 = createHash("sha256").update(pdf.body).digest("hex");
        let parsed;
        try {
          parsed = parseOrderText(pdfToText(pdf.body));
        } catch (err) {
          throw new Error(`${order.url}: ${(err as Error).message}`);
        }
        for (const h of parsed.unknownHeadings) console.log(`::warning title=Unknown order-list heading::"${h}" in ${order.url}`);
        try {
          await writeActions(creds, term, order.url, sha256, parsed.actions);
          stats.documents.push({ url: order.url, sha256, orderDate: parsed.orderDate, actions: parsed.actions.length });
          console.log(`  ${order.label} ${parsed.orderDate ?? "(not an order list)"}: ${parsed.actions.length} action(s)  ${order.url}`);
        } catch (err) {
          reportSdWriteFailure(`court_actions from ${order.url}`, err);
          allRecorded = false;
          status = "failed";
        }
      }
      if (allRecorded) {
        stats.listingLastModified = listing.lastModified;
        stats.complete = true;
      }
    }
  } catch (err) {
    status = "failed";
    stats.halted = (err as Error).message;
    // A halt (rate limit, 403, request cap) is the budget working: a warning.
    // Anything else (an unreadable order, a database error) fails the run.
    if (err instanceof CourtFetchHalt) console.log(`::warning title=Order reader halted::${stats.halted}`);
    else reportSdWriteFailure("read-order-lists", err);
  } finally {
    stats.requests = fetcher.requests;
    try {
      await update(creds, "ingest_runs", `id=eq.${run.id}`, { status, stats, finished_at: new Date().toISOString() });
    } catch (err) {
      reportSdWriteFailure("ingest_runs", err);
    }
    console.log(`[orders] ${status}: ${stats.documents.length} PDF(s) recorded, ${fetcher.requests} request(s).`);
  }
}

main().catch((err) => {
  reportSdWriteFailure("read-order-lists", err);
  process.exitCode = 1;
});
