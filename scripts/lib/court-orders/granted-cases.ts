/**
 * Cert grants become `cases` rows with status `granted`, from two sources:
 *   - once, the Court's Granted & Noted List for the current term
 *     (/orders/{YY}grantednotedlist.pdf, as `pdftotext -layout` text);
 *   - then every grant the order-list reader records in court_actions.
 *
 * A grant finds its case by exact docket number. An existing row is only
 * linked (court_actions.case_id), never changed. A new row gets the docket
 * number, status `granted`, and a slug from the Court's own caption (the
 * same rule as pipeline.ts: docket number + caption from the docket page),
 * and nothing else: no term, sitting or argument date until the calendar
 * step finds the case, which then updates this same row by docket number
 * (scripts/lib/sd-db/write.ts syncCase).
 *
 * The site never shows a `granted` row: the anon read policy on cases
 * excludes it, and the site's queries only ask for argued/upcoming/decided.
 */

import type { SupabaseCredentials } from "../sd-db/env.js";
import { insert, select, update } from "../sd-db/client.js";
import { parseDocketTitle, shortCourtCaption } from "../court-caption.js";
import { caseSlugFromCaption } from "../../pipeline.js";
import type { CourtFetcher } from "./fetch.js";

export const GRANT_ACTIONS = ["petition_granted", "granted_limited_to_question", "probable_jurisdiction_noted"] as const;
export type GrantAction = (typeof GRANT_ACTIONS)[number];

export interface ListedGrant {
  docketNumber: string;
  /** C (certiorari) → petition_granted; A (appeal) → probable_jurisdiction_noted. */
  action: GrantAction;
  /** YYYY-MM-DD. */
  grantedDate: string;
  /** The list's own lines for this entry. */
  courtText: string;
}

export interface GrantedNotedList {
  /** "2026" from "OCTOBER TERM 2026". */
  term: string;
  /** YYYY-MM-DD from "As of October 13, 2026". */
  asOf: string;
  grants: ListedGrant[];
  /** Entries already disposed of without argument ("Result: CASE DISMISSED – Rule 46"). */
  disposed: string[];
  /** Entries whose case code isn't C or A (e.g. Q, certified question). */
  skipped: string[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "6/29/26" → "2026-06-29". */
function mdyy(s: string): string {
  const [m, d, y] = s.split("/").map(Number);
  return `${2000 + y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "25-238)1   CFX   VIRAMONTES V. COOK COUNTY": docket, optional
 *  ")n" group marker, case code, caption. */
const ENTRY_LINE = /^(\d{2}-\d{1,5})(?:\)\d+)?\s{2,}([CAQ][A-Z]{2})\s{2,}(\S.*)$/;

export function parseGrantedNotedList(text: string): GrantedNotedList {
  const term = text.match(/OCTOBER TERM (\d{4})/)?.[1];
  const asOf = text.match(/As of ([A-Z][a-z]+) (\d{1,2}), (\d{4})/);
  if (!term || !asOf) throw new Error("not a Granted & Noted List");
  const asOfIso = `${asOf[3]}-${String(MONTHS.indexOf(asOf[1]) + 1).padStart(2, "0")}-${asOf[2].padStart(2, "0")}`;

  // Entries: one or more entry lines, then indented detail lines, until a
  // blank-separated next entry. The summary tables at the end aren't entries.
  const body = text.split(/\n\s*\d{4} TERM CASES FOR ARGUMENT\s*\n/)[0];
  type Raw = { heads: { docket: string; code: string; line: string }[]; details: string[] };
  const raws: Raw[] = [];
  let cur: Raw | null = null;
  for (const raw of body.split("\n")) {
    const t = raw.replace(/\f/g, "").trim();
    if (!t || /^-\d+-$/.test(t) || /CASES FOR ARGUMENT$/.test(t) || t === "NOTE:") continue;
    const m = t.match(ENTRY_LINE);
    if (m) {
      const head = { docket: m[1], code: m[2], line: `${m[1]} ${m[2]} ${m[3].replace(/\s+/g, " ")}` };
      if (cur && cur.details.length === 0) cur.heads.push(head);
      else raws.push((cur = { heads: [head], details: [] }));
      continue;
    }
    if (cur) cur.details.push(t.replace(/\s{2,}/g, "  "));
  }

  const out: GrantedNotedList = { term, asOf: asOfIso, grants: [], disposed: [], skipped: [] };
  for (const r of raws) {
    const granted = r.details.join(" ").match(/(?:Granted|Noted):\s*(\d{1,2}\/\d{1,2}\/\d{2})/);
    for (const h of r.heads) {
      if (r.details.some((d) => d.startsWith("Result:"))) out.disposed.push(h.docket);
      else if (!granted || (h.code[0] !== "C" && h.code[0] !== "A")) out.skipped.push(h.docket);
      else
        out.grants.push({
          docketNumber: h.docket,
          action: h.code[0] === "A" ? "probable_jurisdiction_noted" : "petition_granted",
          grantedDate: mdyy(granted[1]),
          courtText: [...r.heads.map((x) => x.line), ...r.details].join("\n"),
        });
    }
  }
  return out;
}

export interface EnsuredCase {
  caseId: string;
  slug: string;
  created: boolean;
}

/**
 * The cases row for a granted docket: the existing one (unchanged), or a
 * new `granted` row. Then links every grant action for the docket to it.
 * The docket page is fetched (through the budgeted fetcher) only for a
 * new row.
 */
export async function ensureGrantedCase(
  creds: SupabaseCredentials,
  fetcher: CourtFetcher,
  scotusCourtId: string,
  docketNumber: string,
): Promise<EnsuredCase> {
  const [existing] = await select<{ id: string; slug: string }>(
    creds,
    "cases",
    `?select=id,slug&court_id=eq.${scotusCourtId}&docket_number=eq.${encodeURIComponent(docketNumber)}&status=not.in.(stub,historic)&limit=1`,
  );
  let result: EnsuredCase;
  if (existing) {
    result = { caseId: existing.id, slug: existing.slug, created: false };
  } else {
    const page = await fetcher.get(`https://www.supremecourt.gov/docket/docketfiles/html/public/${docketNumber}.html`);
    const title = parseDocketTitle(page.body.toString("utf8"));
    if (!title) throw new Error(`no "Title:" field on docket page ${docketNumber}`);
    const caption = shortCourtCaption(title);
    const slug = caseSlugFromCaption(docketNumber, caption);
    const [row] = await insert<{ id: string; slug: string }>(creds, "cases", [
      { slug, court_id: scotusCourtId, docket_number: docketNumber, caption, status: "granted", is_stub: false },
    ]);
    result = { caseId: row.id, slug: row.slug, created: true };
  }
  await update(
    creds,
    "court_actions",
    `docket_number=eq.${encodeURIComponent(docketNumber)}&action=in.(${GRANT_ACTIONS.join(",")})&case_id=is.null`,
    { case_id: result.caseId },
  );
  return result;
}
