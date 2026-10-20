/**
 * Which applications the press and public mean by "emergency docket" or
 * "shadow docket". Neither is a Court term; the Court's own terms (the
 * application type and outcome codes, and its verbatim text) stay on each
 * row. Documented in docs/emergency-shadow-docket.md.
 *
 * Rule esd-rule-1, applied to application_details.application_type:
 *   in   applications for interim relief: a stay (incl. partial stay and
 *        stay of execution), an injunction, vacatur of a stay or
 *        injunction, recall and stay of a mandate;
 *   out  routine extensions of time;
 *   else unclassified: left out, and listed for review.
 *
 * Change the rule → bump RULE_VERSION and rebuild.
 */

export const RULE_VERSION = "esd-rule-1";

const INTERIM_RELIEF = new Set(["stay", "partial_stay", "stay_of_execution", "injunction", "recall_and_stay_mandate"]);
const EXTENSIONS = new Set([
  "extension_cert_petition",
  "extension_jurisdictional_statement",
  "extension_merits_reply",
  "extension_rehearing",
]);
/** "to vacate" counts only when what it vacates is interim relief. */
const VACATES_INTERIM_RELIEF = /\bto vacate (?:the |an? )?(?:[\w-]+ ){0,2}(?:stay|injunction)s?\b/i;

export type Verdict = "in" | "out" | "unclassified";

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

export function membership(r: Pick<ApplicationRecord, "application_type" | "application_text">): { verdict: Verdict; reason: string } {
  const t = r.application_type;
  if (t && INTERIM_RELIEF.has(t)) return { verdict: "in", reason: `interim relief: ${t}` };
  if (t && EXTENSIONS.has(t)) return { verdict: "out", reason: `extension of time: ${t}` };
  if (t === "vacate") {
    return VACATES_INTERIM_RELIEF.test(r.application_text)
      ? { verdict: "in", reason: "interim relief: vacate a stay or injunction" }
      : { verdict: "unclassified", reason: "vacate: not a stay or injunction" };
  }
  return { verdict: "unclassified", reason: t ? `type ${t} not covered by ${RULE_VERSION}` : "application type not recognised" };
}

export interface EmergencyShadowDocketRow extends ApplicationRecord {
  rule_version: string;
  application_type: string;
}

export interface Unclassified {
  docket_number: string;
  application_type: string | null;
  application_text: string;
  reason: string;
}

/** The whole table from the base records: same input, same output. */
export function buildEmergencyShadowDocket(records: ApplicationRecord[]): {
  rows: EmergencyShadowDocketRow[];
  excluded: number;
  unclassified: Unclassified[];
} {
  const sorted = [...records].sort((a, b) => a.docket_number.localeCompare(b.docket_number, "en", { numeric: true }));
  const rows: EmergencyShadowDocketRow[] = [];
  const unclassified: Unclassified[] = [];
  let excluded = 0;
  for (const r of sorted) {
    const { verdict, reason } = membership(r);
    if (verdict === "in") {
      rows.push({
        rule_version: RULE_VERSION,
        docket_number: r.docket_number,
        term: r.term,
        title: r.title,
        application_type: r.application_type!,
        application_text: r.application_text,
        directed_to: r.directed_to,
        filed_date: r.filed_date,
        outcome: r.outcome,
        outcome_date: r.outcome_date,
        outcome_text: r.outcome_text,
        pending: r.pending,
        docket_url: r.docket_url,
      });
    } else if (verdict === "out") excluded++;
    else unclassified.push({ docket_number: r.docket_number, application_type: r.application_type, application_text: r.application_text, reason });
  }
  return { rows, excluded, unclassified };
}
