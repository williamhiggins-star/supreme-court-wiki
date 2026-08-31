/**
 * constants.ts — justice person.slug -> the lowercase "justice key" used
 * throughout the app's existing CaseSummary shape (majorityAuthor,
 * concurrenceAuthors, computeDecisionSides' JUSTICE_ORDER, etc.).
 *
 * Inverse of scripts/lib/sd-db/constants.ts's JUSTICE_KEY_TO_SLUG (kept as
 * a separate copy, not a cross-import -- scripts/ and src/ are kept
 * separate everywhere else in this codebase too), same 9 pairs.
 */
export const JUSTICE_KEY_BY_PERSON_SLUG: Record<string, string> = {
  "john-roberts": "roberts",
  "clarence-thomas": "thomas",
  "samuel-alito": "alito",
  "sonia-sotomayor": "sotomayor",
  "elena-kagan": "kagan",
  "neil-gorsuch": "gorsuch",
  "brett-kavanaugh": "kavanaugh",
  "amy-coney-barrett": "barrett",
  "ketanji-brown-jackson": "jackson",
};

/** "Justice {Surname}" / "Chief Justice Roberts" -- matches the free-text
 *  strings data/cases/*.json's JusticeExchange.justice already used
 *  (e.g. key_exchanges' justice_id resolves to a person whose display
 *  string should read the same way the JSON always did). */
export const JUSTICE_DISPLAY_NAME_BY_KEY: Record<string, string> = {
  roberts: "Chief Justice Roberts",
  thomas: "Justice Thomas",
  alito: "Justice Alito",
  sotomayor: "Justice Sotomayor",
  kagan: "Justice Kagan",
  gorsuch: "Justice Gorsuch",
  kavanaugh: "Justice Kavanaugh",
  barrett: "Justice Barrett",
  jackson: "Justice Jackson",
};

/**
 * The current SCOTUS term ("OT{year}", named for the calendar year it
 * STARTS in -- October through the following June/July). Same reasoning
 * as fetch-opinion-authors.ts's currentShortTermYear() and
 * compute-justice-stats.ts's currentTermYear(), just the shared copy for
 * src/ (scripts/ and src/ are kept separate everywhere else in this
 * codebase too, so this is a third copy of the same one-line rule, not a
 * cross-import). Used as every db/ accessor's default `term` parameter,
 * so nothing breaks as OT2025 gives way to OT2026 -- callers that need a
 * specific term (e.g. a future "compare terms" view) still pass one
 * explicitly.
 */
export function currentTermYear(): string {
  const now = new Date();
  const fullYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return String(fullYear);
}
