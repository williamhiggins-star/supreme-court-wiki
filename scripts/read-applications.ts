/**
 * read-applications.ts — records the Court's applications (series yyAnnn,
 * Rules 22-23) in application_details, in the Court's own terms, and the
 * Court's actions on them in court_actions (source_url = the docket page).
 * Current term only: the 26A series, plus 25A applications named in this
 * term's orders. No history backfill.
 *
 * Finding applications (each docket page is fetched once when new):
 *   - the frontier: sequential numbers above the highest one recorded,
 *     until 3 numbers in a row are not found (404). Numbers missed below
 *     the frontier are retried for 7 days;
 *   - application numbers in order PDFs on the Orders of the Court listing
 *     (each PDF read once by this job) and on the in-chambers page.
 * Re-fetching (conditional, If-Modified-Since): only applications still
 * pending, and ones named in an order this job hadn't seen before.
 *
 * Budget (scripts/lib/court-orders/fetch.ts): ≥2 s between requests, an
 * identifying User-Agent, back-off and halt rules, a per-run cap, and the
 * daily cap across all Court jobs (daily-cap.ts). Kill switch:
 * COURT_ORDERS_OFF=1 stops this job too, before any request.
 *
 * No page HTML is stored: only the header fields and the docket entries,
 * with any email address or phone number removed. The Attorneys panel is
 * never read.
 *
 * Writes the database only; nothing here is shown on the site.
 *
 * Run:  npx tsx scripts/read-applications.ts               (nightly)
 *       npx tsx scripts/read-applications.ts --backfill    (first fill: higher caps)
 *       npx tsx scripts/read-applications.ts --reclassify  (no requests: re-apply the
 *                                                           rules to stored records)
 */

import { createHash } from "crypto";
import { getCredentials, type SupabaseCredentials } from "./lib/sd-db/env.js";
import { insert, remove, select, update, upsert } from "./lib/sd-db/client.js";
import { currentTermYear } from "./lib/sd-db/constants.js";
import { reportSdWriteFailure } from "./lib/sd-db/failures.js";
import { CourtFetcher, CourtFetchHalt } from "./lib/court-orders/fetch.js";
import { parseOrdersListing } from "./lib/court-orders/parse.js";
import { pdfToText } from "./lib/court-orders/pdf-text.js";
import { DAILY_CAP, DAILY_CAP_BACKFILL, requestsToday } from "./lib/court-orders/daily-cap.js";
import {
  APPLICATION_NUMBER,
  applicationNumbersIn,
  classifyApplication,
  docketUrl,
  parseApplicationPage,
  termOf,
  type ApplicationPage,
} from "./lib/applications/parse.js";

const MAX_REQUESTS_PER_RUN = 80;
const MAX_REQUESTS_BACKFILL = 900;
const FRONTIER_MISSES = 3;
const RETRY_MISSING_DAYS = 7;
const IN_CHAMBERS_URL = "https://www.supremecourt.gov/opinions/in-chambers.aspx";

interface RunStats {
  job: "applications";
  term: string;
  requests?: number;
  /** Order PDFs this job has read for application numbers. */
  documents: string[];
  listingLastModified?: string | null;
  inChambersLastModified?: string | null;
  /** Numbers to retry: below the frontier but not found yet, or named in
   *  an order and not reached before a halt. { number: since (date) } */
  missing: Record<string, string>;
  added: string[];
  changed: string[];
  halted?: string;
}

interface KnownRow {
  docket_number: string;
  pending: boolean;
  page_last_modified: string | null;
  content_sha256: string;
}

interface StoredRow extends KnownRow {
  title: string;
  docketed_date: string | null;
  lower_court: string | null;
  lower_court_case_numbers: string | null;
  linked_with: string | null;
  entries: ApplicationPage["entries"];
}

const today = () => new Date().toISOString().slice(0, 10);
const numberOf = (docket: string) => Number(docket.match(APPLICATION_NUMBER)?.[2] ?? 0);

/** Write one application's record and its court_actions. Returns false
 *  when the stored content was already identical. */
async function store(creds: SupabaseCredentials, page: ApplicationPage, lastModified: string | null, known?: KnownRow): Promise<boolean> {
  const c = classifyApplication(page);
  const sha = createHash("sha256").update(JSON.stringify({ page, c })).digest("hex");
  const no = page.docketNumber;
  const now = new Date().toISOString();
  if (known?.content_sha256 === sha) {
    await update(creds, "application_details", `docket_number=eq.${no}`, { page_last_modified: lastModified, last_fetched_at: now });
    return false;
  }
  await upsert(
    creds,
    "application_details",
    [
      {
        docket_number: no,
        term: termOf(no),
        docket_url: docketUrl(no),
        title: page.title,
        application_type: c.applicationType,
        application_text: c.applicationText,
        directed_to: c.directedTo,
        filed_date: c.filedDate,
        docketed_date: page.docketedDate,
        lower_court: page.lowerCourt,
        lower_court_case_numbers: page.lowerCourtCaseNumbers,
        linked_with: page.linkedWith,
        outcome: c.outcome,
        outcome_date: c.outcomeDate,
        outcome_text: c.outcomeText,
        pending: c.pending,
        entries: page.entries,
        content_sha256: sha,
        page_last_modified: lastModified,
        last_fetched_at: now,
        updated_at: now,
      },
    ],
    "docket_number",
  );

  // court_actions: one row per (action, date), the Court's words verbatim.
  const actions = [...new Map(c.actions.map((a) => [`${a.action}|${a.date}`, a])).values()];
  const written = await upsert<{ id: string }>(
    creds,
    "court_actions",
    actions.map((a) => ({
      docket_number: no,
      action: a.action,
      action_date: a.date,
      term: termOf(no),
      court_text: a.text,
      source_url: docketUrl(no),
      source_sha256: sha,
    })),
    "docket_number,action,action_date",
  );
  // Rows the rules no longer produce (the docket or the rules changed).
  const keep = written.map((r) => r.id);
  await remove(creds, "court_actions", `docket_number=eq.${no}${keep.length ? `&id=not.in.(${keep.join(",")})` : ""}`);
  return true;
}

/** Re-apply the rules to every stored record. No requests. */
async function reclassify(creds: SupabaseCredentials): Promise<void> {
  const rows = await select<StoredRow>(
    creds,
    "application_details",
    "?select=docket_number,pending,page_last_modified,content_sha256,title,docketed_date,lower_court,lower_court_case_numbers,linked_with,entries",
  );
  let changed = 0;
  for (const r of rows) {
    const page: ApplicationPage = {
      docketNumber: r.docket_number,
      title: r.title,
      docketedDate: r.docketed_date,
      lowerCourt: r.lower_court,
      lowerCourtCaseNumbers: r.lower_court_case_numbers,
      linkedWith: r.linked_with,
      entries: r.entries,
    };
    if (await store(creds, page, r.page_last_modified, r)) changed++;
  }
  console.log(`[applications] reclassified ${rows.length} record(s); ${changed} changed.`);
}

async function main() {
  const found = getCredentials();
  if (!found) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const creds: SupabaseCredentials = found;
  if (process.argv.includes("--reclassify")) return reclassify(creds);
  if (process.env.COURT_ORDERS_OFF === "1") {
    console.log("[applications] COURT_ORDERS_OFF=1: skipped, no requests made.");
    return;
  }
  const backfill = process.argv.includes("--backfill");

  const term = currentTermYear();
  const yy = term.slice(2);
  const prevYy = String(Number(yy) - 1).padStart(2, "0");
  // The next series starts in summer (26A1 was docketed July 1, 2026).
  const month = new Date().getUTCMonth() + 1;
  const frontierSeries = [yy, ...(month >= 7 && month <= 9 ? [String(Number(yy) + 1)] : [])];

  const previous = await select<{ stats: RunStats }>(
    creds,
    "ingest_runs",
    `?select=stats&stats->>job=eq.applications&stats->>term=eq.${term}&order=started_at.desc`,
  );
  const scannedDocs = new Set(previous.flatMap((r) => r.stats.documents ?? []));
  const last = previous[0]?.stats;

  const used = await requestsToday(creds);
  const cap = Math.min(backfill ? MAX_REQUESTS_BACKFILL : MAX_REQUESTS_PER_RUN, (backfill ? DAILY_CAP_BACKFILL : DAILY_CAP) - used);

  const stats: RunStats = { job: "applications", term, documents: [], missing: {}, added: [], changed: [] };
  const [run] = await insert<{ id: string }>(creds, "ingest_runs", [{ status: "running", stats }]);
  const fetcher = new CourtFetcher(Math.max(cap, 0));
  let status: "succeeded" | "failed" = "succeeded";

  const knownRows = await select<KnownRow>(creds, "application_details", "?select=docket_number,pending,page_last_modified,content_sha256");
  const known = new Map(knownRows.map((r) => [r.docket_number, r]));
  const done = new Set<string>();
  const named = new Set<string>();

  /** Fetch one docket page (conditionally when known) and store it.
   *  Returns false on 404. */
  async function visit(no: string): Promise<boolean> {
    done.add(no);
    const k = known.get(no);
    const res = await fetcher.get(docketUrl(no), k?.page_last_modified, { notFoundOk: true });
    if (res.status === 404) {
      if (k) console.log(`::warning title=Application docket not found::${no} was recorded before but is now 404`);
      return false;
    }
    if (res.status === 304) {
      await update(creds, "application_details", `docket_number=eq.${no}`, { last_fetched_at: new Date().toISOString() });
      return true;
    }
    const page = parseApplicationPage(res.body.toString("utf8"));
    if (page.docketNumber !== no) throw new Error(`asked for ${no}, got the docket page of ${page.docketNumber}`);
    if (await store(creds, page, res.lastModified, k)) {
      (k ? stats.changed : stats.added).push(no);
      console.log(`  ${k ? "changed" : "new"} ${no}  ${classifyApplication(page).applicationType ?? "(type unclassified)"}  ${page.title}`);
    }
    return true;
  }

  try {
    if (cap <= 0) throw new CourtFetchHalt(`daily cap reached (${used} request(s) already today)`);

    // 1. Application numbers in order PDFs this job hasn't read.
    const listing = await fetcher.get(`https://www.supremecourt.gov/orders/ordersofthecourt/${yy}`, last?.listingLastModified);
    stats.listingLastModified = listing.status === 304 ? last?.listingLastModified : listing.lastModified;
    if (listing.status === 200) {
      for (const order of parseOrdersListing(listing.body.toString("utf8")).reverse()) {
        if (scannedDocs.has(order.url)) continue;
        const pdf = await fetcher.get(order.url);
        for (const no of applicationNumbersIn(pdfToText(pdf.body), [yy, prevYy])) named.add(no);
        stats.documents.push(order.url);
      }
    }
    // 2. … and on the in-chambers page.
    const chambers = await fetcher.get(IN_CHAMBERS_URL, last?.inChambersLastModified);
    stats.inChambersLastModified = chambers.status === 304 ? last?.inChambersLastModified : chambers.lastModified;
    if (chambers.status === 200) for (const no of applicationNumbersIn(chambers.body.toString("utf8"), [yy, prevYy])) named.add(no);

    // 3. Named in a new order: fetch if new, re-fetch if recorded (it may have changed).
    for (const no of named) await visit(no);

    // 4. Still pending: re-fetch, conditionally.
    for (const r of knownRows) if (r.pending && !done.has(r.docket_number)) await visit(r.docket_number);

    // 5. Carried over from earlier runs: retry for a week.
    for (const [no, since] of Object.entries(last?.missing ?? {})) {
      if (done.has(no)) continue;
      if (!(await visit(no)) && Date.parse(today()) - Date.parse(since) < RETRY_MISSING_DAYS * 864e5) stats.missing[no] = since;
    }

    // 6. The frontier.
    for (const series of frontierSeries) {
      const recorded = [...known.keys(), ...stats.added].filter((n) => n.startsWith(`${series}A`));
      let n = Math.max(0, ...recorded.map(numberOf)) + 1;
      const misses: string[] = [];
      while (misses.length < FRONTIER_MISSES) {
        const no = `${series}A${n++}`;
        if (done.has(no)) continue;
        if (await visit(no)) {
          for (const m of misses) stats.missing[m] = today(); // gaps below a found number
          misses.length = 0;
        } else misses.push(no);
      }
    }
  } catch (err) {
    status = "failed";
    stats.halted = (err as Error).message;
    for (const no of named) if (!done.has(no)) stats.missing[no] = today();
    // A halt (rate limit, 403, a cap) is the budget working: a warning.
    if (err instanceof CourtFetchHalt) console.log(`::warning title=Application reader halted::${stats.halted}`);
    else reportSdWriteFailure("read-applications", err);
  } finally {
    stats.requests = fetcher.requests;
    try {
      await update(creds, "ingest_runs", `id=eq.${run.id}`, { status, stats, finished_at: new Date().toISOString() });
    } catch (err) {
      reportSdWriteFailure("ingest_runs", err);
    }
    console.log(
      `[applications] ${status}: ${stats.added.length} new, ${stats.changed.length} changed, ${fetcher.requests} request(s).`,
    );
  }
}

main().catch((err) => {
  reportSdWriteFailure("read-applications", err);
  process.exitCode = 1;
});
