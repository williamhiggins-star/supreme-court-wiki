/**
 * Reads an application's docket page (/docket/docketfiles/html/public/{n}.html)
 * into the Court's own terms: caption, filing entry, application type,
 * the Justice it was submitted to, lower court, and the Court's actions on
 * it as court_vocabulary codes.
 *
 * Deterministic rules over the page's title and entries; no LLM. Wording
 * the rules don't recognise gives a null code, never a guess; the
 * verbatim text is always kept.
 *
 * Two steps, so classification can be re-run from stored records without
 * fetching again:
 *   parseApplicationPage(html)  → the page's fields and entries, verbatim
 *   classifyApplication(page)   → type, Justice, outcome, pending, actions
 */

import { parseDocketTitle } from "../court-caption.js";
import { parseDocketProceedingsHtml } from "../docket-proceedings.js";

export const DOCKET_PAGE_BASE = "https://www.supremecourt.gov/docket/docketfiles/html/public";
export const APPLICATION_NUMBER = /^(\d{2})A(\d+)$/;

export const docketUrl = (docketNumber: string) => `${DOCKET_PAGE_BASE}/${docketNumber.toLowerCase()}.html`;
/** 26A476 → "2026" (the series prefix is the docket year). */
export const termOf = (docketNumber: string) => `20${docketNumber.slice(0, 2)}`;

/** Application numbers of the given series ("26") in any text: "26A476". */
export function applicationNumbersIn(text: string, series: string[]): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d{2})A(\d{1,5})\b/g)) if (series.includes(m[1])) out.add(`${m[1]}A${Number(m[2])}`);
  return [...out];
}

export interface DocketEntry {
  date: string; // YYYY-MM-DD
  text: string; // the Court's words, contact details removed
}

export interface ApplicationPage {
  docketNumber: string;
  title: string;
  docketedDate: string | null;
  lowerCourt: string | null;
  lowerCourtCaseNumbers: string | null;
  linkedWith: string | null;
  entries: DocketEntry[];
}

export interface ApplicationAction {
  action: string; // court_vocabulary code
  date: string;
  text: string;
}

export interface ApplicationClassification {
  applicationType: string | null;
  applicationText: string;
  directedTo: string | null;
  filedDate: string | null;
  outcome: string | null;
  outcomeDate: string | null;
  outcomeText: string | null;
  pending: boolean;
  actions: ApplicationAction[];
}

// ---------------------------------------------------------------------------
// Contact details: the page's Attorneys panel is never read, and any email
// address or phone number that reaches stored text is removed.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\bPh:\s*)?\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b|\bPh:\s*\d{10}\b/g;

export function stripContacts(text: string): string {
  return text.replace(EMAIL, "[email removed]").replace(PHONE, "[phone removed]");
}

// ---------------------------------------------------------------------------
// Page → fields

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function longDate(s: string | null): string | null {
  const m = s?.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** A "Label:" row of the docket header table. */
function headerField(html: string, label: string): string | null {
  const m = html.match(new RegExp(`${label}\\s*</span>\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i"));
  const value = m ? plain(m[1]) : "";
  return value || null;
}

export function parseApplicationPage(html: string): ApplicationPage {
  // "Docket for 26A476", or "Docket for 26A456 *** CAPITAL CASE ***"
  const no = html.match(/<title>\s*Docket for (\d{2}A\d+)\b/i)?.[1];
  if (!no) throw new Error("not an application docket page (no 'Docket for yyAnnn' title)");
  const title = parseDocketTitle(html);
  if (!title) throw new Error(`${no}: no "Title:" field`);
  return {
    docketNumber: no.toUpperCase(),
    title: stripContacts(title),
    docketedDate: longDate(headerField(html, "Docketed:")),
    lowerCourt: headerField(html, "Lower Ct:"),
    lowerCourtCaseNumbers: headerField(html, "Case Numbers:"),
    linkedWith: headerField(html, "Linked with:"),
    entries: parseDocketProceedingsHtml(html).map((e) => ({ date: e.date, text: stripContacts(e.description) })),
  };
}

// ---------------------------------------------------------------------------
// Fields → the Court's terms

/** What the application asks for, from the filing entry ("for a stay",
 *  "to extend the time to file …"). Anchored at the start, so each
 *  filing gets at most one type. */
const TYPE_RULES: [RegExp, string][] = [
  [/^to extend the time to file (?:a |the )?petitions? for (?:a )?writs? of certiorari\b/i, "extension_cert_petition"],
  [/^to extend the time to file (?:a |the )?jurisdictional statement/i, "extension_jurisdictional_statement"],
  [/^to extend the time to file (?:a |the )?petitions? for rehearing/i, "extension_rehearing"],
  [/^to extend the time to file (?:a |the )?reply brief/i, "extension_merits_reply"],
  [/^to recall and stay the mandate\b/i, "recall_and_stay_mandate"],
  [/^to vacate\b/i, "vacate"],
  [/^for (?:a |an )?stays? of execution\b/i, "stay_of_execution"],
  [/^for (?:a )?partial stay\b/i, "partial_stay"],
  [/^for (?:a |an )?stay\b/i, "stay"],
  [/^for (?:a |an )?(?:writ of )?injunction\b|^for injunctive relief\b/i, "injunction"],
  [/^for (?:bail|release)\b/i, "bail"],
];

export function applicationTypeOf(purpose: string): string | null {
  for (const [re, code] of TYPE_RULES) if (re.test(purpose)) return code;
  return null;
}

/** Codes that end an application (until any refiling). */
export const FINAL_OUTCOMES = new Set([
  "application_granted",
  "application_granted_in_part",
  "application_denied",
  "application_denied_as_moot",
  "extension_of_time_granted",
  "application_treated_as_petition",
  "application_withdrawn",
  "dismissed",
]);

/** Codes kept as an application's outcome: the final ones, plus those
 *  that say where it stands meanwhile. */
const OUTCOME_CODES = new Set([...FINAL_OUTCOMES, "referred_to_the_court", "application_deferred"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The Court's verb for the application itself: the first one in the
 *  entry, so "… is denied. The petition for a writ of mandamus is
 *  denied." reads as the application's denial. */
function dispositionOf(text: string): string | null {
  const verbs: [RegExp, string][] = [
    [/\bgranted by (?:Justice|The Chief Justice)[^.]*extending the time\b/i, "extension_of_time_granted"],
    [/\b(?:is|are) granted in part\b|\bgranted in part\b/i, "application_granted_in_part"],
    [/\b(?:is|are) denied as moot\b|\bdenied as moot\b/i, "application_denied_as_moot"],
    [/\b(?:is|are) deferred\b/i, "application_deferred"],
    [/\b(?:is|are) treated as a petition\b/i, "application_treated_as_petition"],
    [/\b(?:is|are) granted\b|\bgranted by\b/i, "application_granted"],
    [/\b(?:is|are) denied\b|\bdenied by\b/i, "application_denied"],
    [/\b(?:is|are) dismissed\b|\bdismissed by\b/i, "dismissed"],
    [/\bwithdrawn\b/i, "application_withdrawn"],
  ];
  let best: { at: number; code: string } | null = null;
  for (const [re, code] of verbs) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { at: m.index, code };
  }
  return best?.code ?? null;
}

/** One docket entry → the Court's action on this application, or null
 *  for filings by the parties, amicus briefs, Clerk notices and anything
 *  the rules don't recognise. */
export function actionOf(docketNumber: string, text: string): string | null {
  const app = `Application \\(${esc(docketNumber)}\\)`;
  if (new RegExp(`^${app} referred to the Court\\.?$`, "i").test(text)) return "referred_to_the_court";
  if (new RegExp(`^${app} refiled and submitted to\\b`, "i").test(text)) return "renewed_application";
  if (new RegExp(`^Response to application \\(${esc(docketNumber)}\\) requested by\\b`, "i").test(text)) return "application_response_requested";
  if (/^Order entered by\b/i.test(text)) return chambersOrderAction(text);
  const disposes = new RegExp(`^(?:${app}|The application\\b|The applications\\b)`, "i").test(text);
  if (!disposes || new RegExp(`^${app}[^.]*,\\s*submitted to\\b`, "i").test(text)) return null;
  return dispositionOf(text);
}

/** "Order entered by Justice …: …" — a single Justice's order on the
 *  application. Only these wordings get a code. */
function chambersOrderAction(text: string): string | null {
  // "… is hereby stayed pending further order of the undersigned or of the
  // Court" / "… are hereby administratively stayed until …" (press:
  // "administrative stay").
  if (/\bstayed pending further order\b|\badministratively stayed\b/i.test(text)) return "administrative_stay";
  // "it is ordered that the application for stay is denied without prejudice …"
  const ruling = text.match(/\bordered that the application\b[^.]*/i);
  const disposition = ruling ? dispositionOf(ruling[0]) : null;
  if (disposition) return disposition;
  // "It is hereby ordered that any response to the new application (26A305) be filed by …"
  if (/\bordered that (?:any |a )?response to the (?:new )?application\b/i.test(text)) return "application_response_requested";
  return null;
}

export function classifyApplication(page: ApplicationPage): ApplicationClassification {
  const no = esc(page.docketNumber);
  const filingRe = new RegExp(`^Application \\(${no}\\)\\s+(.*?)(?:,\\s*submitted to ([^.]+?)(?:\\.\\s.*)?)?\\.?$`, "i");
  const filing = page.entries.find((e) => filingRe.test(e.text) && actionOf(page.docketNumber, e.text) === null);
  const m = filing?.text.match(filingRe);

  const actions: ApplicationAction[] = [];
  for (const e of page.entries) {
    const action = actionOf(page.docketNumber, e.text);
    if (action) actions.push({ action, date: e.date, text: e.text });
  }

  const outcomeAction = [...actions].reverse().find((a) => OUTCOME_CODES.has(a.action));
  // Pending until a final disposition follows the latest filing or refiling.
  const lastFiling = Math.max(
    filing ? page.entries.indexOf(filing) : -1,
    ...page.entries.map((e, i) => (actionOf(page.docketNumber, e.text) === "renewed_application" ? i : -1)),
  );
  const decided = page.entries.some(
    (e, i) => i > lastFiling && FINAL_OUTCOMES.has(actionOf(page.docketNumber, e.text) ?? ""),
  );

  return {
    applicationType: m ? applicationTypeOf(m[1]) : null,
    applicationText: filing?.text ?? "",
    directedTo: m?.[2]?.trim() ?? null,
    filedDate: filing?.date ?? null,
    outcome: outcomeAction?.action ?? null,
    outcomeDate: outcomeAction?.date ?? null,
    outcomeText: outcomeAction?.text ?? null,
    pending: !decided,
    actions,
  };
}
