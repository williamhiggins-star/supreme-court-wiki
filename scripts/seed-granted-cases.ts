/**
 * seed-granted-cases.ts — one-time seed of `granted` cases from the
 * Court's Granted & Noted List for the current term (OT2026 on; no
 * history). After this, new grants come from the order-list reader
 * (scripts/read-order-lists.ts).
 *
 * For each grant on the list:
 *   - a court_actions row (petition_granted, or probable_jurisdiction_noted
 *     for an appeal) with the list's own lines and the list's URL, unless
 *     a grant for that docket is already recorded (e.g. from an order list);
 *   - the cases row, found by exact docket number or created as `granted`
 *     (scripts/lib/court-orders/granted-cases.ts), and linked.
 * Entries the list shows as disposed of without argument are skipped.
 *
 * Refuses to run twice for a term (ingest_runs, stats.job =
 * "granted_noted_seed"). Same request budget as the order-list reader.
 *
 * Needs `pdftotext` (poppler-utils).
 *
 * Run:  npx tsx scripts/seed-granted-cases.ts
 */

import { createHash } from "crypto";
import { getCredentials } from "./lib/sd-db/env.js";
import { insert, select, update } from "./lib/sd-db/client.js";
import { currentTermYear } from "./lib/sd-db/constants.js";
import { CourtFetcher } from "./lib/court-orders/fetch.js";
import { pdfToText } from "./lib/court-orders/pdf-text.js";
import { GRANT_ACTIONS, ensureGrantedCase, parseGrantedNotedList } from "./lib/court-orders/granted-cases.js";

const MAX_REQUESTS = 80;

async function main() {
  const creds = getCredentials();
  if (!creds) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const term = currentTermYear();
  if (Number(term) < 2026) throw new Error(`OT${term} is before OT2026: nothing to seed.`);

  const done = await select(creds, "ingest_runs", `?select=id&status=eq.succeeded&stats->>job=eq.granted_noted_seed&stats->>term=eq.${term}`);
  if (done.length > 0) {
    console.log(`[seed] OT${term} was already seeded; nothing to do.`);
    return;
  }

  const [scotus] = await select<{ id: string }>(creds, "courts", "?select=id&slug=eq.scotus");
  const fetcher = new CourtFetcher(MAX_REQUESTS);
  const url = `https://www.supremecourt.gov/orders/${term.slice(2)}grantednotedlist.pdf`;
  const pdf = await fetcher.get(url);
  const sha256 = createHash("sha256").update(pdf.body).digest("hex");
  const list = parseGrantedNotedList(pdfToText(pdf.body));
  if (list.term !== term) throw new Error(`${url} is the OT${list.term} list, not OT${term}`);
  console.log(`[seed] OT${term} Granted & Noted List as of ${list.asOf}: ${list.grants.length} grant(s); disposed of without argument: ${list.disposed.join(", ") || "none"}; skipped: ${list.skipped.join(", ") || "none"}.`);

  const [run] = await insert<{ id: string }>(creds, "ingest_runs", [{ status: "running", stats: { job: "granted_noted_seed", term } }]);
  const dockets = list.grants.map((g) => g.docketNumber);
  const recorded = await select<{ docket_number: string }>(
    creds,
    "court_actions",
    `?select=docket_number&action=in.(${GRANT_ACTIONS.join(",")})&docket_number=in.(${dockets.join(",")})`,
  );
  const hasGrant = new Set(recorded.map((r) => r.docket_number));
  const newActions = list.grants.filter((g) => !hasGrant.has(g.docketNumber));
  await insert(
    creds,
    "court_actions",
    newActions.map((g) => ({
      docket_number: g.docketNumber,
      action: g.action,
      action_date: g.grantedDate,
      term,
      court_text: g.courtText,
      source_url: url,
      source_sha256: sha256,
    })),
  );

  const created: string[] = [];
  const linked: string[] = [];
  for (const g of list.grants) {
    const c = await ensureGrantedCase(creds, fetcher, scotus.id, g.docketNumber);
    (c.created ? created : linked).push(c.slug);
    console.log(`  ${g.docketNumber}  ${c.created ? "created granted" : "linked existing"}  ${c.slug}`);
  }

  const stats = { job: "granted_noted_seed", term, asOf: list.asOf, url, sha256, actionsInserted: newActions.length, created, linked, disposed: list.disposed, requests: fetcher.requests };
  await update(creds, "ingest_runs", `id=eq.${run.id}`, { status: "succeeded", stats, finished_at: new Date().toISOString() });
  console.log(`[seed] done: ${newActions.length} grant action(s) recorded, ${created.length} case(s) created as granted, ${linked.length} existing case(s) linked, ${fetcher.requests} request(s).`);
}

main().catch((err) => {
  console.error(`[seed] failed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
