/**
 * Which applications go in emergency_shadow_docket, and the starting value
 * of public_view for a new row. "Emergency docket" and "shadow docket" are
 * not Court terms; the Court's own terms (type code, verbatim text,
 * outcome) stay on each row. Documented in docs/emergency-shadow-docket.md.
 *
 * Rule esd-rule-2 (over-includes; public_view holds the editorial choice):
 *   in, public_view yes   interim relief: a stay (incl. partial stay and stay
 *                         of execution), an injunction, vacatur of a stay or
 *                         injunction, recall and stay of a mandate;
 *   in, public_view no    bail; an extension of time to comply with an order;
 *                         leave to exceed word or page limits; a certificate
 *                         of appealability;
 *   out                   routine extensions of time to file;
 *   review                anything else: kept out, and listed for review.
 * Previous version esd-rule-1: the "public_view yes" group only, everything
 * else listed as unclassified.
 *
 * public_view is only the starting value for a new row: the pipeline never
 * changes it on an existing row. Change the rule → bump RULE_VERSION, then
 * run the manual full rebuild.
 */

export const RULE_VERSION = "esd-rule-2";

const INTERIM_RELIEF = new Set(["stay", "partial_stay", "stay_of_execution", "injunction", "recall_and_stay_mandate"]);
const EXTENSIONS = new Set([
  "extension_cert_petition",
  "extension_jurisdictional_statement",
  "extension_merits_reply",
  "extension_rehearing",
]);
/** "to vacate" is interim relief only when it vacates a stay or injunction. */
const VACATES_INTERIM_RELIEF = /\bto vacate (?:the |an? )?(?:[\w-]+ ){0,2}(?:stay|injunction)s?\b/i;
/** Other applications kept in the table with public_view = no, by the
 *  Court's wording (most have no glossary code). */
const OTHER_KEPT: [RegExp, string][] = [
  [/\bextension of time within which to comply with\b/i, "extension of time to comply with an order"],
  [/\bin excess of (?:the )?(?:word|page) limits?\b/i, "leave to exceed word or page limits"],
  [/\bfor a certificate of appealability\b/i, "certificate of appealability"],
];

export type Verdict = "in" | "out" | "review";

export interface ApplicationRecord {
  docket_number: string;
  term: string;
  title: string;
  application_type: string | null;
  application_text: string;
  directed_to: string | null;
  filed_date: string | null;
  outcome: string | null;
  outcome_date: string | null;
  outcome_text: string | null;
  pending: boolean;
  docket_url: string;
}

export function membership(r: Pick<ApplicationRecord, "application_type" | "application_text">): {
  verdict: Verdict;
  publicView: boolean;
  reason: string;
} {
  const t = r.application_type;
  if (t && INTERIM_RELIEF.has(t)) return { verdict: "in", publicView: true, reason: `interim relief: ${t}` };
  if (t === "vacate" && VACATES_INTERIM_RELIEF.test(r.application_text)) {
    return { verdict: "in", publicView: true, reason: "interim relief: vacate a stay or injunction" };
  }
  if (t && EXTENSIONS.has(t)) return { verdict: "out", publicView: false, reason: `extension of time to file: ${t}` };
  if (t === "bail") return { verdict: "in", publicView: false, reason: "bail" };
  for (const [re, what] of OTHER_KEPT) if (re.test(r.application_text)) return { verdict: "in", publicView: false, reason: what };
  return { verdict: "review", publicView: false, reason: t ? `type ${t} not covered by ${RULE_VERSION}` : "wording not recognised" };
}

/** The facts on a row, all from application_details. public_view and
 *  built_at are not facts: the database tables hold those. */
export interface EmergencyShadowDocketRow extends ApplicationRecord {
  rule_version: string;
}

export interface ReviewItem {
  docket_number: string;
  application_type: string | null;
  application_text: string;
  reason: string;
}

/** The whole grouping from the base records: same input, same output. */
export function buildEmergencyShadowDocket(records: ApplicationRecord[]): {
  rows: (EmergencyShadowDocketRow & { defaultPublicView: boolean })[];
  excluded: number;
  review: ReviewItem[];
} {
  const sorted = [...records].sort((a, b) => a.docket_number.localeCompare(b.docket_number, "en", { numeric: true }));
  const rows: (EmergencyShadowDocketRow & { defaultPublicView: boolean })[] = [];
  const review: ReviewItem[] = [];
  let excluded = 0;
  for (const r of sorted) {
    const m = membership(r);
    if (m.verdict === "in") {
      rows.push({
        rule_version: RULE_VERSION,
        docket_number: r.docket_number,
        term: r.term,
        title: r.title,
        application_type: r.application_type,
        application_text: r.application_text,
        directed_to: r.directed_to,
        filed_date: r.filed_date,
        outcome: r.outcome,
        outcome_date: r.outcome_date,
        outcome_text: r.outcome_text,
        pending: r.pending,
        docket_url: r.docket_url,
        defaultPublicView: m.publicView,
      });
    } else if (m.verdict === "out") excluded++;
    else review.push({ docket_number: r.docket_number, application_type: r.application_type, application_text: r.application_text, reason: m.reason });
  }
  return { rows, excluded, review };
}
