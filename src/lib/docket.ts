import { computeDecisionSides } from "@/lib/decisionSides";
import type { CaseSummary } from "@/types";

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getDocketStatus(c: CaseSummary): "upcoming" | "argued" | "decided" {
  if (c.docketStatus === "decided") return "decided";
  if (c.outcome) return "decided";
  if (!c.argumentDate) return "upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = c.argumentDate.split("-").map(Number);
  const argDate = new Date(y, m - 1, d);
  if (argDate > today) return "upcoming";
  return "argued";
}

export type DecidedItem = {
  type: "case";
  slug: string;
  title: string;
  sub: string;
  termYear: string;
  href: string;
  // Which Docket column this case is in right now -- decided cases carry
  // real decisionDate/voteSplit/majorityAuthor below; upcoming and argued
  // cases carry none of that (nothing to show yet), only argumentDate.
  docketStatus: "upcoming" | "argued" | "decided";
  argumentDate: string;
  decisionDate?: string;
  voteSplit?: string;
  podcastEpisodeUrl?: string;
  majorityAuthor?: string;
  dissentAuthors: string[];
  majoritySideJustices: string[];
  // Author + joiners per separately-written concurring/dissenting opinion.
  // "Concurring Opinion"/"Dissenting" match on `author` (did this justice
  // WRITE one), not side membership -- a justice who only joined someone
  // else's dissent without writing their own doesn't count (that's a
  // different question, "who was on the losing side," which
  // majoritySideJustices already answers). "Joined By" then looks up the
  // matched justice's own entry here for who joined THEIR opinion.
  concurringSummaries: { author: string; joinedBy: string[] }[];
  dissentSummaries: { author: string; joinedBy: string[] }[];
  issueCategory: { slug: string; label: string } | null;
};

function buildItem(c: CaseSummary & { voteLine?: string | null }): DecidedItem {
  // Prefer the DB's own recorded vote line (cases.vote_line) when
  // present (only ~12/66 cases have it manually researched so far), else
  // fall back to computeDecisionSides()'s real losingSide count --
  // NOT dissentAuthors.length, which only counts justices who separately
  // AUTHORED a dissent and silently undercounts one who joined another's
  // dissent without writing their own (confirmed on Zorn v. Linton: 1
  // dissent author but 3 actual dissenting votes -- dissentAuthors.length
  // alone would compute "8–1" against the real "6–3"). Safe to run on an
  // upcoming/argued case too -- computeDecisionSides() and every field
  // below tolerate missing decision data, and voteSplit stays undefined
  // (not a bogus "Unanimous") whenever majorityAuthor itself is absent.
  const dissents = computeDecisionSides(c).losingSide.length;
  // A per curiam 9-0 is "Per Curiam," never "Unanimous" -- collapsing
  // the two loses the (author-less) per curiam signal entirely. Only
  // matters when the case is actually unanimous; a non-unanimous split
  // (e.g. "6–3") already reads correctly either way.
  const isPerCuriam = c.majorityAuthor === "per_curiam";
  const unanimousLabel = isPerCuriam ? "Per Curiam" : "Unanimous";
  const fallbackSplit = dissents === 0 ? unanimousLabel : `${9 - dissents}–${dissents}`;
  const dbSplit = c.voteLine?.endsWith("-0") ? unanimousLabel : c.voteLine?.replace("-", "–");
  const voteSplit = c.majorityAuthor ? (dbSplit ?? fallbackSplit) : undefined;
  return {
    type: "case" as const,
    slug: c.slug,
    title: c.title,
    sub: `${c.termYear} Term · ${c.caseNumber}`,
    termYear: c.termYear,
    href: `/cases/${c.slug}`,
    docketStatus: getDocketStatus(c),
    argumentDate: c.argumentDate,
    decisionDate: c.decisionDate,
    voteSplit,
    podcastEpisodeUrl: c.podcastEpisodeUrl,
    majorityAuthor: c.majorityAuthor,
    dissentAuthors: c.dissentAuthors ?? [],
    majoritySideJustices: c.majoritySideJustices ?? [],
    concurringSummaries: (c.concurringSummaries ?? []).map((s) => ({ author: s.author, joinedBy: s.joinedBy ?? [] })),
    dissentSummaries: (c.dissentSummaries ?? []).map((s) => ({ author: s.author, joinedBy: s.joinedBy ?? [] })),
    issueCategory: c.issueCategory ?? null,
  };
}

// Tie-break for cases on the same date: docket number, ascending
// ("25-965" before "26-426"; applications like "25A312" after a term's
// numbered petitions; slugs start with the docket number). A placeholder
// until the Court's argument order or time of day is available; without
// it, ties came out in database order.
export function compareDocketNumbers(a: { slug: string }, b: { slug: string }): number {
  const key = (slug: string) => {
    const m = slug.match(/^(\d+)(-|a)(\d+)/i);
    return m ? [Number(m[1]), m[2] === "-" ? 0 : 1, Number(m[3])] : [0, 0, 0];
  };
  const [ka, kb] = [key(a.slug), key(b.slug)];
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
}

export function buildDecidedList(decidedCases: (CaseSummary & { voteLine?: string | null })[]): DecidedItem[] {
  const items = decidedCases.map(buildItem);
  items.sort((a, b) => {
    const dateA = a.decisionDate ?? a.sub.split(" ")[0];
    const dateB = b.decisionDate ?? b.sub.split(" ")[0];
    return dateB.localeCompare(dateA) || compareDocketNumbers(a, b);
  });
  return items;
}

// All Cases panel's full list -- every tracked case regardless of Docket
// status, not just decided ones. Grouped by status (decided, then argued,
// then upcoming) rather than a single blended date sort: a future
// argument date would otherwise sort ahead of real decisions, and mixing
// "most recently decided" with "soonest upcoming" into one date axis has
// no single sensible direction. Decided keeps its existing most-recent-
// first order; upcoming is soonest-first, matching the Docket's own
// Upcoming column.
export function buildAllCasesList(cases: (CaseSummary & { voteLine?: string | null })[]): DecidedItem[] {
  const items = cases.map(buildItem);
  const rank = { decided: 0, argued: 1, upcoming: 2 };
  items.sort((a, b) => {
    if (rank[a.docketStatus] !== rank[b.docketStatus]) return rank[a.docketStatus] - rank[b.docketStatus];
    if (a.docketStatus === "upcoming") return a.argumentDate.localeCompare(b.argumentDate) || compareDocketNumbers(a, b);
    const dateA = a.decisionDate ?? a.argumentDate;
    const dateB = b.decisionDate ?? b.argumentDate;
    return dateB.localeCompare(dateA) || compareDocketNumbers(a, b);
  });
  return items;
}
