import type { CaseSummary } from "@/types";

// Canonical seniority order
export const JUSTICE_ORDER = [
  "roberts", "thomas", "alito", "sotomayor", "kagan",
  "gorsuch", "kavanaugh", "barrett", "jackson",
] as const;

export type Side = "majority" | "plurality" | "concur-dissent" | "dissent";

export interface JusticeEntry {
  key: string;
  side: Side;
  ringColor: string;
  roleLabel: string | null;
  roleHref: string | null;
}

export interface DecisionSides {
  isPerCuriam: boolean;
  winningSide: JusticeEntry[];
  concurDissentSide: JusticeEntry[];
  losingSide: JusticeEntry[];
}

/**
 * A justice's true side/role can be split across two places in the data:
 * the top-level *Authors array (who wrote a given opinion) and the
 * joinedBy list on each per-author summary (who signed onto that opinion
 * without writing it). Both must be consulted — a justice who ONLY
 * appears in a joinedBy list (e.g. joined a dissent but didn't write one)
 * is otherwise invisible to side placement and silently defaults to the
 * majority bucket. This was the root cause of justices who joined a
 * dissent/concurrence rendering with a majority-side ring and no label.
 */
export function computeDecisionSides(c: CaseSummary): DecisionSides {
  const majorityAuthor = c.majorityAuthor ?? null;
  const isPerCuriam = majorityAuthor === "per_curiam";

  // Each opinion type tracks TWO sets: who authored it (the *Authors
  // array) and who's tied to it at all (authors plus everyone in a
  // joinedBy list). A justice can be in the second without being in the
  // first — they joined without writing their own opinion — and that
  // distinction matters for the role LABEL (not the ring color): an
  // author earns "X opinion", a joiner-only earns "Joined X opinion".
  // Conflating the two meant a justice who only joined, say, a
  // concurrence got labeled identically to the justice who wrote it —
  // confirmed on 18 of 60 decided cases for concurrence alone before this
  // fix, plus 2 for concur/dissent and 23 for dissent.
  const concurDissentAuthorSet = new Set<string>(c.concurDissentAuthors ?? []);
  const concurDissentSet = new Set<string>(concurDissentAuthorSet);
  for (const s of c.concurDissentSummaries ?? []) {
    for (const j of s.joinedBy ?? []) concurDissentSet.add(j);
  }

  const dissentAuthorSet = new Set<string>(c.dissentAuthors ?? []);
  const dissentSet = new Set<string>(dissentAuthorSet);
  for (const s of c.dissentSummaries ?? []) {
    for (const j of s.joinedBy ?? []) dissentSet.add(j);
  }
  // concur/dissent is the more specific classification — never let a
  // justice be double-counted as a plain dissenter too.
  for (const k of concurDissentSet) { dissentSet.delete(k); dissentAuthorSet.delete(k); }

  const concurrenceAuthorSet = new Set<string>(c.concurrenceAuthors ?? []);
  const concurrenceSet = new Set<string>(concurrenceAuthorSet);
  for (const s of c.concurringSummaries ?? []) {
    for (const j of s.joinedBy ?? []) concurrenceSet.add(j);
  }
  for (const k of concurDissentSet) { concurrenceSet.delete(k); concurrenceAuthorSet.delete(k); }
  for (const k of dissentSet) { concurrenceSet.delete(k); concurrenceAuthorSet.delete(k); }

  // A majority opinion can split by parts: full majority on some, only a
  // plurality (not enough votes for a majority) on others — same author,
  // typically, but a narrower coalition. pluralityAuthor is almost always
  // majorityAuthor themself (handled as a plain "Majority opinion" below —
  // authoring the actual majority is their more senior status); the ring
  // this adds is for justices whose tie to the case is joining that
  // narrower coalition, distinct from the full majority join.
  const pluralityAuthor = c.pluralityAuthor ?? null;
  const pluralitySet = new Set<string>(c.pluralityJoinedBy ?? []);
  if (pluralityAuthor) pluralitySet.add(pluralityAuthor);
  for (const k of concurDissentSet) pluralitySet.delete(k);
  for (const k of dissentSet) pluralitySet.delete(k);

  function buildEntry(key: string): JusticeEntry {
    const isConcurDissentAuthor = concurDissentAuthorSet.has(key);
    const isConcurDissentJoinerOnly = !isConcurDissentAuthor && concurDissentSet.has(key);
    const isConcurDissent = isConcurDissentAuthor || isConcurDissentJoinerOnly;

    const isDissentAuthor = !isConcurDissent && dissentAuthorSet.has(key);
    const isDissentJoinerOnly = !isConcurDissent && !isDissentAuthor && dissentSet.has(key);
    const isDissenter = isDissentAuthor || isDissentJoinerOnly;

    const isMajorityAuthor = !isPerCuriam && majorityAuthor === key;

    const isConcurringAuthor = !isConcurDissent && concurrenceAuthorSet.has(key);
    const isConcurringJoinerOnly = !isConcurDissent && !isConcurringAuthor && concurrenceSet.has(key);
    const isConcurring = isConcurringAuthor || isConcurringJoinerOnly;

    const isPluralityAuthorSelf = !isMajorityAuthor && !isConcurDissent && !isConcurring && pluralityAuthor === key;
    const isPluralityMember =
      !isMajorityAuthor && !isConcurDissent && !isConcurring && !isDissenter && !isPluralityAuthorSelf && pluralitySet.has(key);

    const side: Side = isConcurDissent
      ? "concur-dissent"
      : isDissenter
        ? "dissent"
        : isPluralityAuthorSelf || isPluralityMember
          ? "plurality"
          : "majority";
    const ringColor =
      side === "dissent" ? "ring-rose-500"
        : side === "concur-dissent" ? "ring-amber-500"
        : side === "plurality" ? "ring-teal-500"
        : "ring-emerald-500";

    let roleLabel: string | null = null;
    let roleHref: string | null = null;
    if (isMajorityAuthor) { roleLabel = "Majority opinion"; roleHref = "#majority-opinion"; }
    else if (isConcurDissentAuthor) { roleLabel = "Concurring in part, dissenting in part"; roleHref = "#concur-dissent-opinions"; }
    else if (isConcurDissentJoinerOnly) { roleLabel = "Joined concurring/dissenting opinion"; roleHref = "#concur-dissent-opinions"; }
    else if (isConcurringAuthor) { roleLabel = "Concurring opinion"; roleHref = "#concurring-opinions"; }
    else if (isConcurringJoinerOnly) { roleLabel = "Joined concurring opinion"; roleHref = "#concurring-opinions"; }
    else if (isDissentAuthor) { roleLabel = "Dissenting opinion"; roleHref = "#dissenting-opinions"; }
    else if (isDissentJoinerOnly) { roleLabel = "Joined dissenting opinion"; roleHref = "#dissenting-opinions"; }
    else if (isPluralityAuthorSelf) { roleLabel = "Plurality opinion"; roleHref = "#plurality-opinion"; }
    else if (isPluralityMember) { roleLabel = "Joined plurality opinion"; roleHref = "#plurality-opinion"; }

    return { key, side, ringColor, roleLabel, roleHref };
  }

  // Winning side, in display order:
  //   1. Majority opinion author (unless per curiam)
  //   2. Concurring authors, by seniority
  //   3. Plurality-only members (joined the narrower coalition, nothing more specific), by seniority
  //   4. Every remaining justice not placed elsewhere (silent majority joiners), by seniority
  const winningSide: JusticeEntry[] = [];
  if (majorityAuthor && !isPerCuriam && !dissentSet.has(majorityAuthor) && !concurDissentSet.has(majorityAuthor)) {
    winningSide.push(buildEntry(majorityAuthor));
  }
  JUSTICE_ORDER.forEach((k) => {
    if (concurrenceSet.has(k) && k !== majorityAuthor) winningSide.push(buildEntry(k));
  });
  JUSTICE_ORDER.forEach((k) => {
    if (!dissentSet.has(k) && !concurDissentSet.has(k) && !concurrenceSet.has(k) && k !== majorityAuthor && pluralitySet.has(k)) {
      winningSide.push(buildEntry(k));
    }
  });
  JUSTICE_ORDER.forEach((k) => {
    if (!dissentSet.has(k) && !concurDissentSet.has(k) && !concurrenceSet.has(k) && !pluralitySet.has(k) && k !== majorityAuthor) {
      winningSide.push(buildEntry(k));
    }
  });

  const concurDissentSide = JUSTICE_ORDER.filter((k) => concurDissentSet.has(k)).map(buildEntry);
  const losingSide = JUSTICE_ORDER.filter((k) => dissentSet.has(k)).map(buildEntry);

  return { isPerCuriam, winningSide, concurDissentSide, losingSide };
}
