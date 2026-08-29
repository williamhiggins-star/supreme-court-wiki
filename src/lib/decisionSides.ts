import type { CaseSummary } from "@/types";

// Canonical seniority order
export const JUSTICE_ORDER = [
  "roberts", "thomas", "alito", "sotomayor", "kagan",
  "gorsuch", "kavanaugh", "barrett", "jackson",
] as const;

export type Side = "majority" | "concur-dissent" | "dissent";

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

  const concurDissentAuthors = c.concurDissentAuthors ?? [];
  const concurDissentSet = new Set<string>(concurDissentAuthors);
  for (const s of c.concurDissentSummaries ?? []) {
    for (const j of s.joinedBy ?? []) concurDissentSet.add(j);
  }

  const dissentSet = new Set<string>(c.dissentAuthors ?? []);
  for (const s of c.dissentSummaries ?? []) {
    for (const j of s.joinedBy ?? []) dissentSet.add(j);
  }
  // concur/dissent is the more specific classification — never let a
  // justice be double-counted as a plain dissenter too.
  for (const k of concurDissentSet) dissentSet.delete(k);

  const concurrenceSet = new Set<string>(c.concurrenceAuthors ?? []);
  for (const s of c.concurringSummaries ?? []) {
    for (const j of s.joinedBy ?? []) concurrenceSet.add(j);
  }
  for (const k of concurDissentSet) concurrenceSet.delete(k);
  for (const k of dissentSet) concurrenceSet.delete(k);

  function buildEntry(key: string): JusticeEntry {
    const isConcurDissent = concurDissentSet.has(key);
    const isDissenter = !isConcurDissent && dissentSet.has(key);
    const isMajorityAuthor = !isPerCuriam && majorityAuthor === key;
    const isConcurring = !isConcurDissent && concurrenceSet.has(key);

    const side: Side = isConcurDissent ? "concur-dissent" : isDissenter ? "dissent" : "majority";
    const ringColor =
      side === "dissent" ? "ring-rose-500" : side === "concur-dissent" ? "ring-amber-500" : "ring-emerald-500";

    let roleLabel: string | null = null;
    let roleHref: string | null = null;
    if (isMajorityAuthor) { roleLabel = "Majority opinion"; roleHref = "#majority-opinion"; }
    else if (isConcurDissent) { roleLabel = "Concurring in part, dissenting in part"; roleHref = "#concur-dissent-opinions"; }
    else if (isConcurring) { roleLabel = "Concurring opinion"; roleHref = "#concurring-opinions"; }
    else if (isDissenter) { roleLabel = "Dissenting opinion"; roleHref = "#dissenting-opinions"; }

    return { key, side, ringColor, roleLabel, roleHref };
  }

  // Winning side, in display order:
  //   1. Majority opinion author (unless per curiam)
  //   2. Concurring authors, by seniority
  //   3. Every remaining justice not placed elsewhere (silent majority joiners), by seniority
  const winningSide: JusticeEntry[] = [];
  if (majorityAuthor && !isPerCuriam && !dissentSet.has(majorityAuthor) && !concurDissentSet.has(majorityAuthor)) {
    winningSide.push(buildEntry(majorityAuthor));
  }
  JUSTICE_ORDER.forEach((k) => {
    if (concurrenceSet.has(k) && k !== majorityAuthor) winningSide.push(buildEntry(k));
  });
  JUSTICE_ORDER.forEach((k) => {
    if (!dissentSet.has(k) && !concurDissentSet.has(k) && !concurrenceSet.has(k) && k !== majorityAuthor) {
      winningSide.push(buildEntry(k));
    }
  });

  const concurDissentSide = JUSTICE_ORDER.filter((k) => concurDissentSet.has(k)).map(buildEntry);
  const losingSide = JUSTICE_ORDER.filter((k) => dissentSet.has(k)).map(buildEntry);

  return { isPerCuriam, winningSide, concurDissentSide, losingSide };
}
