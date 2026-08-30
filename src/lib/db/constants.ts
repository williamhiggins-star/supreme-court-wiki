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
