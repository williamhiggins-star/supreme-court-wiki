/**
 * constants.ts — reference tables and regexes shared by every script that
 * writes into the SD Supabase schema.
 *
 * Ported from scripts/backfill-db.ts (the Phase 2 one-time backfill),
 * where all of this was validated against the full data/ corpus and fixed
 * up through several rounds of real bugs (see that file's git history —
 * the joinersAfter period-vs-"C. J." bug, the vote-side conflict
 * tie-break, the statute-vs-case misclassification, the state_appellate
 * court level). Kept here as the one canonical copy so the daily
 * dual-write scripts and any future one-time script never re-diverge from
 * or reintroduce bugs already fixed once.
 */

/** Justice key (as used in case JSON's majorityAuthor/concurrenceAuthors/
 *  dissentAuthors and key_exchanges' free-text labels) -> the people.slug
 *  seeded in Phase 1. */
export const JUSTICE_KEY_TO_SLUG: Record<string, string> = {
  roberts: "john-roberts",
  thomas: "clarence-thomas",
  alito: "samuel-alito",
  sotomayor: "sonia-sotomayor",
  kagan: "elena-kagan",
  gorsuch: "neil-gorsuch",
  kavanaugh: "brett-kavanaugh",
  barrett: "amy-coney-barrett",
  jackson: "ketanji-brown-jackson",
};

export const JUSTICE_LAST_NAMES: Record<string, string> = {
  roberts: "roberts",
  thomas: "thomas",
  alito: "alito",
  sotomayor: "sotomayor",
  kagan: "kagan",
  gorsuch: "gorsuch",
  kavanaugh: "kavanaugh",
  barrett: "barrett",
  jackson: "jackson",
};

/** Resolve a free-text key_exchanges "justice" label (e.g. "Chief Justice
 *  Roberts", "Justice Kagan") to a JUSTICE_KEY_TO_SLUG key, by last-name
 *  substring match — same technique compute-justice-stats.ts uses. */
export function resolveJusticeLabel(label: string): string | null {
  const up = label.toUpperCase();
  for (const [key, lastName] of Object.entries(JUSTICE_LAST_NAMES)) {
    if (up.includes(lastName.toUpperCase())) return key;
  }
  return null;
}

export const CIRCUIT_KEY_TO_COURT_SLUG: Record<string, string> = {
  ca1: "first-circuit",
  ca2: "second-circuit",
  ca3: "third-circuit",
  ca4: "fourth-circuit",
  ca5: "fifth-circuit",
  ca6: "sixth-circuit",
  ca7: "seventh-circuit",
  ca8: "eighth-circuit",
  ca9: "ninth-circuit",
  ca10: "tenth-circuit",
  ca11: "eleventh-circuit",
  cadc: "dc-circuit",
  cafc: "federal-circuit",
};

/** Exact `court` display strings written into data/precedents/*.json (see
 *  the precedent-data-fix commit) -> the matching Phase-1-seeded
 *  courts.slug. Deliberately a small hardcoded table, not a fuzzy matcher.
 *  Not exercised by the daily scripts today (none of them touch
 *  data/precedents/*.json's `court` field), kept here so it stays the one
 *  canonical copy if that ever changes. */
export const PRECEDENT_COURT_TEXT_TO_SLUG: Record<string, string> = {
  "U.S. Court of Appeals for the Ninth Circuit": "ninth-circuit",
  "U.S. Court of Appeals for the Federal Circuit": "federal-circuit",
  "U.S. Court of Appeals for the Eleventh Circuit": "eleventh-circuit",
  "U.S. Court of Appeals for the Sixth Circuit": "sixth-circuit",
  "Supreme Court of Illinois": "illinois-supreme-court",
  "Supreme Court of Delaware": "delaware-supreme-court",
  "California Court of Appeal, Second Appellate District": "california-court-of-appeal-second-appellate-district",
};

export const IMPACT_AREA_MAP: Record<string, string> = {
  Securities: "securities",
  Antitrust: "antitrust",
  "Labor & Employment": "labor",
  "Intellectual Property": "ip",
  Arbitration: "arbitration",
  "Class Actions": "class_actions",
  Bankruptcy: "bankruptcy",
};

export const SPLIT_STATUS_MAP: Record<string, string> = {
  open: "open",
  scotus_pending: "cert_granted",
  scotus_resolved: "resolved",
};

/** Matches a U.S. Code / C.F.R. / Public Law citation — i.e. a
 *  data/precedents/*.json entry with this citation shape is actually a
 *  STATUTE, not an adjudicated case (see the precedent-data-fix commit —
 *  enrich-precedents.ts fabricated majority/dissent opinions for several
 *  of these before that was caught). */
export const STATUTE_CITATION_RE = /U\.S\.C\.|C\.F\.R\.|Pub\.?\s*L\./;

/** SCOTUS opinions are always cited as "___ U.S. ___" (or "___ S. Ct.
 *  ___" for very recent ones). A citation matching a state or
 *  federal-circuit reporter instead is a strong signal a "precedent" is
 *  not actually a Supreme Court case. */
export const NON_SCOTUS_REPORTER_RE =
  /\d+\s+(A\.\s?\d?d|N\.E\.\s?\d?d|N\.W\.\s?\d?d|P\.\s?\d?d|S\.E\.\s?\d?d|S\.W\.\s?\d?d|So\.\s?\d?d|Cal\.\s?(Rptr\.|App\.)|F\.\s?\d?d|F\.\s?Supp)/;
