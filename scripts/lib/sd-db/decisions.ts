/**
 * decisions.ts — computes decision_ties + decisions rows from a case's
 * CaseSummary, reusing computeDecisionSides (src/lib/decisionSides.ts) so
 * the database can never disagree with what the site renders.
 *
 * Pure, no I/O: returns case-JSON-level keys (justice person_slug,
 * opinion_kind + opinion_author_slug) rather than database ids. write.ts
 * and backfill-db.ts each resolve those keys against their own
 * already-established id-resolution mechanism (write.ts's opinionIdByKey
 * built right after inserting opinions; backfill-db.ts's equivalent
 * case_slug-qualified map built in applyModel) — same pattern opinion_joins
 * already uses in both files.
 *
 * join_scope is always written as 'full': data/cases/*.json has no
 * structured field for which Parts of an opinion a partial joiner signed
 * onto (confirmed 2026-08-28; 'partial' + join_scope_detail exist in the
 * schema for whenever that data becomes available). Recusal is similarly
 * unrepresented — a recused justice produces no decisions row at all,
 * the same gap already present in the existing votes table.
 */
import { computeDecisionSides } from "../../../src/lib/decisionSides.js";
import type { CaseSummary } from "../../../src/types/index.js";
import { JUSTICE_KEY_TO_SLUG } from "./constants.js";

export type OpinionKind = "majority" | "plurality" | "concurrence" | "concur_dissent" | "dissent";
export type Position = OpinionKind; // decisions.position mirrors opinion_ties' opinion_kind values 1:1

export interface DecisionTieInput {
  opinion_kind: OpinionKind;
  opinion_author_slug: string; // identifies WHICH opinion of that kind, together with case + kind
  person_slug: string;
  role: "author" | "joiner";
  join_scope: "full";
}

export interface DecisionInput {
  person_slug: string;
  position: Position;
  /** Which decision_tie this position is backed by, keyed the same way as
   *  DecisionTieInput above. Null for a justice who defaults to the
   *  majority bucket without an explicit majorityJoinedBy entry — see
   *  decisionSides.ts's "silent default majority joiner" comment. */
  primaryTieKey: { opinion_kind: OpinionKind; opinion_author_slug: string } | null;
}

const ROLE_HREF_TO_POSITION: Record<string, Position> = {
  "#majority-opinion": "majority",
  "#plurality-opinion": "plurality",
  "#concurring-opinions": "concurrence",
  "#concur-dissent-opinions": "concur_dissent",
  "#dissenting-opinions": "dissent",
};

export function computeDecisionTiesAndPositions(
  c: CaseSummary,
  warnings: string[],
): { ties: DecisionTieInput[]; decisions: DecisionInput[] } {
  const context = c.slug ?? c.title ?? "(unknown case)";

  function resolveSlug(key: string, field: string): string | null {
    const slug = JUSTICE_KEY_TO_SLUG[key];
    if (!slug) warnings.push(`case ${context}: unrecognized justice key "${key}" (${field}).`);
    return slug ?? null;
  }

  const ties: DecisionTieInput[] = [];
  const seenTieKeys = new Set<string>();
  function pushTie(t: DecisionTieInput) {
    const key = `${t.opinion_kind}::${t.opinion_author_slug}::${t.person_slug}`;
    if (seenTieKeys.has(key)) return;
    seenTieKeys.add(key);
    ties.push(t);
  }

  // majority
  if (c.majorityAuthor && c.majorityAuthor !== "per_curiam") {
    const authorSlug = resolveSlug(c.majorityAuthor, "majorityAuthor");
    if (authorSlug) {
      pushTie({ opinion_kind: "majority", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
      for (const j of c.majorityJoinedBy ?? []) {
        const js = resolveSlug(j, "majorityJoinedBy");
        if (js) pushTie({ opinion_kind: "majority", opinion_author_slug: authorSlug, person_slug: js, role: "joiner", join_scope: "full" });
      }
    }
  }

  // plurality
  if (c.pluralityAuthor) {
    const authorSlug = resolveSlug(c.pluralityAuthor, "pluralityAuthor");
    if (authorSlug) {
      pushTie({ opinion_kind: "plurality", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
      for (const j of c.pluralityJoinedBy ?? []) {
        if (j === c.pluralityAuthor) continue;
        const js = resolveSlug(j, "pluralityJoinedBy");
        if (js) pushTie({ opinion_kind: "plurality", opinion_author_slug: authorSlug, person_slug: js, role: "joiner", join_scope: "full" });
      }
    }
  }

  // concurrence — per-author summaries, plus flat concurrenceAuthors
  // entries with no matching summary (same fallback write.ts's existing
  // opinions block already uses).
  const concurrenceSummaryAuthors = new Set((c.concurringSummaries ?? []).map((s) => s.author));
  for (const s of c.concurringSummaries ?? []) {
    const authorSlug = resolveSlug(s.author, "concurringSummaries author");
    if (!authorSlug) continue;
    pushTie({ opinion_kind: "concurrence", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
    for (const j of s.joinedBy ?? []) {
      const js = resolveSlug(j, "concurringSummaries joinedBy");
      if (js) pushTie({ opinion_kind: "concurrence", opinion_author_slug: authorSlug, person_slug: js, role: "joiner", join_scope: "full" });
    }
  }
  for (const key of c.concurrenceAuthors ?? []) {
    if (concurrenceSummaryAuthors.has(key)) continue;
    const authorSlug = resolveSlug(key, "concurrenceAuthors");
    if (authorSlug) pushTie({ opinion_kind: "concurrence", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
  }

  // concur/dissent
  const concurDissentSummaryAuthors = new Set((c.concurDissentSummaries ?? []).map((s) => s.author));
  for (const s of c.concurDissentSummaries ?? []) {
    const authorSlug = resolveSlug(s.author, "concurDissentSummaries author");
    if (!authorSlug) continue;
    pushTie({ opinion_kind: "concur_dissent", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
    for (const j of s.joinedBy ?? []) {
      const js = resolveSlug(j, "concurDissentSummaries joinedBy");
      if (js) pushTie({ opinion_kind: "concur_dissent", opinion_author_slug: authorSlug, person_slug: js, role: "joiner", join_scope: "full" });
    }
  }
  for (const key of c.concurDissentAuthors ?? []) {
    if (concurDissentSummaryAuthors.has(key)) continue;
    const authorSlug = resolveSlug(key, "concurDissentAuthors");
    if (authorSlug) pushTie({ opinion_kind: "concur_dissent", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
  }

  // dissent
  const dissentSummaryAuthors = new Set((c.dissentSummaries ?? []).map((s) => s.author));
  for (const s of c.dissentSummaries ?? []) {
    const authorSlug = resolveSlug(s.author, "dissentSummaries author");
    if (!authorSlug) continue;
    pushTie({ opinion_kind: "dissent", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
    for (const j of s.joinedBy ?? []) {
      const js = resolveSlug(j, "dissentSummaries joinedBy");
      if (js) pushTie({ opinion_kind: "dissent", opinion_author_slug: authorSlug, person_slug: js, role: "joiner", join_scope: "full" });
    }
  }
  for (const key of c.dissentAuthors ?? []) {
    if (dissentSummaryAuthors.has(key)) continue;
    const authorSlug = resolveSlug(key, "dissentAuthors");
    if (authorSlug) pushTie({ opinion_kind: "dissent", opinion_author_slug: authorSlug, person_slug: authorSlug, role: "author", join_scope: "full" });
  }

  // decisions — reuse the exact priority logic the site renders with, so
  // the two can never drift apart. Every JusticeEntry from every bucket
  // (winning/concur-dissent/losing) maps to exactly one decisions row.
  const sides = computeDecisionSides(c);
  const allEntries = [...sides.winningSide, ...sides.concurDissentSide, ...sides.losingSide];

  const decisions: DecisionInput[] = [];
  for (const entry of allEntries) {
    const justiceSlug = resolveSlug(entry.key, "decisionSides entry");
    if (!justiceSlug) continue;
    const position: Position = entry.roleHref ? (ROLE_HREF_TO_POSITION[entry.roleHref] ?? "majority") : "majority";

    const candidates = ties.filter((t) => t.person_slug === justiceSlug && t.opinion_kind === position);
    const primary = candidates.find((t) => t.role === "author") ?? candidates[0] ?? null;

    decisions.push({
      person_slug: justiceSlug,
      position,
      primaryTieKey: primary ? { opinion_kind: primary.opinion_kind, opinion_author_slug: primary.opinion_author_slug } : null,
    });
  }

  return { ties, decisions };
}
