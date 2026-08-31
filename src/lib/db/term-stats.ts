/**
 * term-stats.ts — typed accessors over the term_stats_* views
 * (supabase/migrations/20260831090000_term_stats_views.sql).
 */

import { db } from "./client";
import { currentTermYear } from "./constants";

export async function getOpinionsAuthored(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_opinions_authored").select("*").eq("term", term);
  if (error) throw new Error(`getOpinionsAuthored: ${error.message}`);
  return data ?? [];
}

export async function getWordCountsByAuthor(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_word_counts_by_author").select("*").eq("term", term);
  if (error) throw new Error(`getWordCountsByAuthor: ${error.message}`);
  return data ?? [];
}

export async function getOpinionWordCountExtremes(term: string = currentTermYear()) {
  const { data, error } = await db
    .from("term_stats_opinion_word_count_extremes")
    .select("*")
    .eq("term", term)
    .order("word_count", { ascending: true });
  if (error) throw new Error(`getOpinionWordCountExtremes: ${error.message}`);
  return data ?? [];
}

export async function getAgreementRates(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_agreement").select("*").eq("term", term);
  if (error) throw new Error(`getAgreementRates: ${error.message}`);
  return data ?? [];
}

export async function getMajorityFrequency(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_majority_frequency").select("*").eq("term", term);
  if (error) throw new Error(`getMajorityFrequency: ${error.message}`);
  return data ?? [];
}

export async function getCircuitScorecard(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_circuit_scorecard").select("*").eq("term", term);
  if (error) throw new Error(`getCircuitScorecard: ${error.message}`);
  return data ?? [];
}

export async function getCircuitScorecardDetail(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_circuit_scorecard_detail").select("*").eq("term", term);
  if (error) throw new Error(`getCircuitScorecardDetail: ${error.message}`);
  return data ?? [];
}

export async function getUnanimityRate(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_unanimity_rate").select("*").eq("term", term).maybeSingle();
  if (error) throw new Error(`getUnanimityRate: ${error.message}`);
  return data ?? null;
}

export async function getIdeologicalSplitRate(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_ideological_split_rate").select("*").eq("term", term).maybeSingle();
  if (error) throw new Error(`getIdeologicalSplitRate: ${error.message}`);
  return data ?? null;
}

export async function getDaysToDecisionByAuthor(term: string = currentTermYear()) {
  const { data, error } = await db.from("term_stats_days_to_decision_by_author").select("*").eq("term", term);
  if (error) throw new Error(`getDaysToDecisionByAuthor: ${error.message}`);
  return data ?? [];
}

export async function getCaseCombinedWordCounts(term: string = currentTermYear()) {
  const { data, error } = await db
    .from("term_stats_case_combined_word_counts")
    .select("*")
    .eq("term", term)
    .order("combined_word_count", { ascending: false });
  if (error) throw new Error(`getCaseCombinedWordCounts: ${error.message}`);
  return data ?? [];
}

// §10's concurrence/dissent authorship-count grouping (docs/term-stats-
// coding-rules.md) -- concurrence_in_judgment/concurrence_in_part count as
// concurrences, dissent_in_part counts as a dissent. "majority" is kept
// strict (not merged with "plurality") since scotusdashboard2's Opinions
// section asks for the longest *majority* opinion specifically.
const CONCURRENCE_KINDS = ["concurrence", "concurrence_in_judgment", "concurrence_in_part"];
const DISSENT_KINDS = ["dissent", "dissent_in_part"];

export interface OpinionLengthDetail {
  opinionId: string;
  caseSlug: string;
  caseCaption: string;
  wordCount: number;
  kind: string;
  authorSlug: string | null;
  joinerSlugs: string[];
}

export interface JusticeOpinionExtreme {
  justiceSlug: string;
  caseSlug: string;
  caseCaption: string;
  wordCount: number;
  kind: string;
}

export interface OpinionLengthStats {
  averageWordCount: number | null;
  longestOverall: OpinionLengthDetail | null;
  longestMajority: OpinionLengthDetail | null;
  longestConcurrence: OpinionLengthDetail | null;
  longestDissent: OpinionLengthDetail | null;
  shortestOverall: OpinionLengthDetail | null;
  shortestMajority: OpinionLengthDetail | null;
  shortestConcurrence: OpinionLengthDetail | null;
  // Each justice's own single longest/shortest opinion this term, both
  // sorted largest-value-first (i.e. shortestByJustice is sorted by that
  // justice's shortest opinion, largest of those first) -- same sort
  // convention for both, for the "Longest/Shortest Opinion by Justice" bar
  // charts. Justices with no word-counted opinion this term are simply
  // absent, not zeroed.
  longestByJustice: JusticeOpinionExtreme[];
  shortestByJustice: JusticeOpinionExtreme[];
}

async function getJoinerSlugsByOpinionIds(opinionIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (opinionIds.length === 0) return map;
  const { data, error } = await db
    .from("decision_ties")
    .select("opinion_id, people ( slug )")
    .in("opinion_id", opinionIds)
    .eq("role", "joiner");
  if (error) throw new Error(`getJoinerSlugsByOpinionIds: ${error.message}`);
  for (const row of data ?? []) {
    const slug = row.people?.slug;
    if (!slug) continue;
    const list = map.get(row.opinion_id) ?? [];
    list.push(slug);
    map.set(row.opinion_id, list);
  }
  return map;
}

/**
 * Opinions section, "Length" menu item: average opinion length for the
 * term, plus the single longest opinion overall and the longest opinion of
 * each of the majority/concurrence/dissent kind-families, each with its
 * author and joiners. Reads every decided opinion's word count from
 * term_stats_opinion_word_count_extremes (already the per-opinion, not
 * pre-filtered, view -- see its migration comment) and picks the maxima in
 * JS rather than 4 separate ORDER BY/LIMIT round trips.
 */
export async function getOpinionLengthStats(term: string = currentTermYear()): Promise<OpinionLengthStats> {
  const { data, error } = await db
    .from("term_stats_opinion_word_count_extremes")
    // people!opinions_author_id_fkey, not a bare people(...) embed -- this
    // view also carries a same-named FK to term_stats_voting_alignment_grid
    // (see database.ts), which makes a bare "people" embed ambiguous to
    // PostgREST here even though it isn't for the other term_stats_* views.
    .select("opinion_id, case_slug, caption, kind, word_count, people!opinions_author_id_fkey ( slug )")
    .eq("term", term);
  if (error) throw new Error(`getOpinionLengthStats: ${error.message}`);

  const rows = (data ?? []).filter(
    (r): r is typeof r & {
      opinion_id: string;
      word_count: number;
      case_slug: string;
      caption: string;
      kind: string;
    } => r.opinion_id != null && r.word_count != null && r.case_slug != null && r.caption != null && r.kind != null,
  );

  const averageWordCount =
    rows.length > 0 ? Math.round(rows.reduce((sum, r) => sum + r.word_count, 0) / rows.length) : null;

  function extremeMatching(mode: "longest" | "shortest", kinds?: string[]) {
    const pool = kinds ? rows.filter((r) => kinds.includes(r.kind ?? "")) : rows;
    return pool.reduce<(typeof pool)[number] | null>((best, r) => {
      if (!best) return r;
      return mode === "longest"
        ? r.word_count > best.word_count
          ? r
          : best
        : r.word_count < best.word_count
          ? r
          : best;
    }, null);
  }

  const picks = {
    longestOverall: extremeMatching("longest"),
    longestMajority: extremeMatching("longest", ["majority"]),
    longestConcurrence: extremeMatching("longest", CONCURRENCE_KINDS),
    longestDissent: extremeMatching("longest", DISSENT_KINDS),
    shortestOverall: extremeMatching("shortest"),
    shortestMajority: extremeMatching("shortest", ["majority"]),
    shortestConcurrence: extremeMatching("shortest", CONCURRENCE_KINDS),
  };

  const opinionIds = Object.values(picks)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => r.opinion_id);
  const joinersByOpinion = await getJoinerSlugsByOpinionIds(opinionIds);

  function toDetail(row: (typeof rows)[number] | null): OpinionLengthDetail | null {
    if (!row) return null;
    return {
      opinionId: row.opinion_id,
      caseSlug: row.case_slug,
      caseCaption: row.caption,
      wordCount: row.word_count,
      kind: row.kind,
      authorSlug: row.people?.slug ?? null,
      joinerSlugs: joinersByOpinion.get(row.opinion_id) ?? [],
    };
  }

  function perAuthorExtreme(mode: "longest" | "shortest"): JusticeOpinionExtreme[] {
    const byAuthor = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const slug = r.people?.slug;
      if (!slug) continue;
      const existing = byAuthor.get(slug);
      const better =
        !existing || (mode === "longest" ? r.word_count > existing.word_count : r.word_count < existing.word_count);
      if (better) byAuthor.set(slug, r);
    }
    return [...byAuthor.entries()]
      .map(([justiceSlug, r]) => ({
        justiceSlug,
        caseSlug: r.case_slug,
        caseCaption: r.caption,
        wordCount: r.word_count,
        kind: r.kind,
      }))
      .sort((a, b) => b.wordCount - a.wordCount);
  }

  return {
    averageWordCount,
    longestOverall: toDetail(picks.longestOverall),
    longestMajority: toDetail(picks.longestMajority),
    longestConcurrence: toDetail(picks.longestConcurrence),
    longestDissent: toDetail(picks.longestDissent),
    shortestOverall: toDetail(picks.shortestOverall),
    shortestMajority: toDetail(picks.shortestMajority),
    shortestConcurrence: toDetail(picks.shortestConcurrence),
    longestByJustice: perAuthorExtreme("longest"),
    shortestByJustice: perAuthorExtreme("shortest"),
  };
}

export interface JusticeAgreementPair {
  justiceSlug1: string;
  justiceSlug2: string;
  agreementPct: number;
}

/**
 * Opinions section, "Alignment" menu item: pairwise agreement rate (§5,
 * docs/term-stats-coding-rules.md) between every unordered pair of
 * justices, all cases -- matches Feldman's "Justice Agreement – All Cases"
 * grid (Stat Pack PDF p.11). term_stats_agreement only carries person_id
 * UUIDs, not slugs, and its person_id_1/person_id_2 columns share the same
 * underlying FK name, which makes a bare people(...) embed ambiguous to
 * PostgREST (the same class of issue getOpinionLengthStats hit) -- resolved
 * here with a plain people(id, slug) lookup instead of an embed, rather
 * than fighting a second FK-hint disambiguation.
 */
export async function getJusticeAgreementGrid(term: string = currentTermYear()): Promise<JusticeAgreementPair[]> {
  const [{ data: rows, error: rowsError }, { data: people, error: peopleError }] = await Promise.all([
    db.from("term_stats_agreement").select("person_id_1, person_id_2, agreement_pct").eq("term", term),
    db.from("people").select("id, slug"),
  ]);
  if (rowsError) throw new Error(`getJusticeAgreementGrid: ${rowsError.message}`);
  if (peopleError) throw new Error(`getJusticeAgreementGrid people: ${peopleError.message}`);

  const slugById = new Map((people ?? []).map((p) => [p.id, p.slug]));

  return (rows ?? [])
    .map((r) => {
      const slug1 = r.person_id_1 ? slugById.get(r.person_id_1) : undefined;
      const slug2 = r.person_id_2 ? slugById.get(r.person_id_2) : undefined;
      if (!slug1 || !slug2 || r.agreement_pct == null) return null;
      return { justiceSlug1: slug1, justiceSlug2: slug2, agreementPct: r.agreement_pct };
    })
    .filter((r): r is JusticeAgreementPair => r !== null);
}

export interface JusticeSoloCount {
  justiceSlug: string;
  count: number;
}

export interface MostJoinedOpinion {
  justiceSlug: string;
  caseSlug: string;
  caseCaption: string;
  joinerCount: number;
}

export interface JusticeCaseRef {
  caseSlug: string;
  caseCaption: string;
}

export interface CasesByCategoryAndJustice {
  total: Record<string, JusticeCaseRef[]>;
  majority: Record<string, JusticeCaseRef[]>;
  concurrence: Record<string, JusticeCaseRef[]>;
  dissent: Record<string, JusticeCaseRef[]>;
}

export interface JusticeJoinCount {
  justiceSlug: string;
  count: number;
}

export interface OpinionJoinerHighlights {
  mostSoloConcurrences: JusticeSoloCount | null;
  mostJoinedConcurrence: MostJoinedOpinion | null;
  mostSoloDissents: JusticeSoloCount | null;
  mostJoinedDissent: MostJoinedOpinion | null;
  // Every justice's own cases for each opinion-kind category (plus "total",
  // the union of the three), keyed by justice slug -- for listing out which
  // cases back the Volume bar chart's per-metric "Most X" highlight,
  // whoever currently holds it for the selected metric.
  casesByJusticeAndCategory: CasesByCategoryAndJustice;
  // Which justice(s) joined (role='joiner') the most concurrences/dissents
  // this term -- not "most joiners on one opinion" (that's
  // mostJoinedConcurrence/Dissent above), but "joined the most opinions,
  // tallied across the whole term." All justices tied for the max are
  // included, not just one.
  mostJoinedConcurrences: JusticeJoinCount[];
  mostJoinedDissents: JusticeJoinCount[];
}

/**
 * Opinions section, "Volume" > "Highlights" menu item: per-opinion joiner
 * counts, bucketed the same concurrence/dissent way as CONCURRENCE_KINDS/
 * DISSENT_KINDS above -- which justice authored the most *solo* (zero-
 * joiner) concurrences/dissents, and which single concurrence/dissent this
 * term picked up the most joiners. Reads every decided opinion for the
 * term directly from `opinions` (not term_stats_opinion_word_count_extremes,
 * which is scoped to opinions with a populated word_count -- these stats
 * don't depend on word count, so there's no reason to inherit that filter).
 */
export async function getOpinionJoinerHighlights(term: string = currentTermYear()): Promise<OpinionJoinerHighlights> {
  const { data: caseRows, error: caseError } = await db
    .from("cases")
    .select("id")
    .eq("term", term)
    .eq("status", "decided");
  if (caseError) throw new Error(`getOpinionJoinerHighlights cases: ${caseError.message}`);
  const caseIds = (caseRows ?? []).map((c) => c.id);
  const empty: OpinionJoinerHighlights = {
    mostSoloConcurrences: null,
    mostJoinedConcurrence: null,
    mostSoloDissents: null,
    mostJoinedDissent: null,
    casesByJusticeAndCategory: { total: {}, majority: {}, concurrence: {}, dissent: {} },
    mostJoinedConcurrences: [],
    mostJoinedDissents: [],
  };
  if (caseIds.length === 0) return empty;

  const { data: opinionRows, error: opinionError } = await db
    .from("opinions")
    .select("id, kind, people!opinions_author_id_fkey ( slug ), cases ( slug, caption )")
    .in("case_id", caseIds);
  if (opinionError) throw new Error(`getOpinionJoinerHighlights opinions: ${opinionError.message}`);
  const opinionIds = (opinionRows ?? []).map((o) => o.id);

  const { data: tieRows, error: tieError } = await db
    .from("decision_ties")
    .select("opinion_id, people ( slug )")
    .in("opinion_id", opinionIds)
    .eq("role", "joiner");
  if (tieError) throw new Error(`getOpinionJoinerHighlights decision_ties: ${tieError.message}`);

  const joinerCountByOpinion = new Map<string, number>();
  for (const t of tieRows ?? []) {
    joinerCountByOpinion.set(t.opinion_id, (joinerCountByOpinion.get(t.opinion_id) ?? 0) + 1);
  }

  function analyze(kinds: string[]): { solo: JusticeSoloCount | null; mostJoined: MostJoinedOpinion | null } {
    const soloCountByJustice = new Map<string, number>();
    let mostJoined: MostJoinedOpinion | null = null;
    for (const o of opinionRows ?? []) {
      if (!kinds.includes(o.kind)) continue;
      const slug = o.people?.slug;
      if (!slug) continue;
      const joinerCount = joinerCountByOpinion.get(o.id) ?? 0;
      if (joinerCount === 0) {
        soloCountByJustice.set(slug, (soloCountByJustice.get(slug) ?? 0) + 1);
      }
      const caseSlug = o.cases?.slug;
      const caseCaption = o.cases?.caption;
      if (caseSlug && caseCaption && (!mostJoined || joinerCount > mostJoined.joinerCount)) {
        mostJoined = { justiceSlug: slug, caseSlug, caseCaption, joinerCount };
      }
    }
    let solo: JusticeSoloCount | null = null;
    for (const [justiceSlug, count] of soloCountByJustice) {
      if (!solo || count > solo.count) solo = { justiceSlug, count };
    }
    return { solo, mostJoined };
  }

  const concurrence = analyze(CONCURRENCE_KINDS);
  const dissent = analyze(DISSENT_KINDS);

  function buildCaseMap(matches: (kind: string) => boolean): Record<string, JusticeCaseRef[]> {
    const map: Record<string, JusticeCaseRef[]> = {};
    for (const o of opinionRows ?? []) {
      if (!matches(o.kind)) continue;
      const slug = o.people?.slug;
      const caseSlug = o.cases?.slug;
      const caseCaption = o.cases?.caption;
      if (!slug || !caseSlug || !caseCaption) continue;
      (map[slug] ??= []).push({ caseSlug, caseCaption });
    }
    return map;
  }

  const isMajority = (kind: string) => kind === "majority";
  const isConcurrence = (kind: string) => CONCURRENCE_KINDS.includes(kind);
  const isDissent = (kind: string) => DISSENT_KINDS.includes(kind);

  const casesByJusticeAndCategory: CasesByCategoryAndJustice = {
    // Same three buckets volumeMetricValue's "Total" sums (majority +
    // concurrences + dissents) -- not every opinions.kind (plurality,
    // concur_dissent, per_curiam are excluded from all four, matching the
    // bar chart's own Total).
    total: buildCaseMap((k) => isMajority(k) || isConcurrence(k) || isDissent(k)),
    majority: buildCaseMap(isMajority),
    concurrence: buildCaseMap(isConcurrence),
    dissent: buildCaseMap(isDissent),
  };

  const kindByOpinionId = new Map((opinionRows ?? []).map((o) => [o.id, o.kind]));

  // How many opinions of this kind-family has each justice joined (not
  // authored) this term, tallied across every such opinion -- all justices
  // tied for the max are returned, not just one.
  function mostJoined(matches: (kind: string) => boolean): JusticeJoinCount[] {
    const counts = new Map<string, number>();
    for (const t of tieRows ?? []) {
      const kind = kindByOpinionId.get(t.opinion_id);
      const slug = t.people?.slug;
      if (!kind || !matches(kind) || !slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    const max = Math.max(0, ...counts.values());
    if (max === 0) return [];
    return [...counts.entries()]
      .filter(([, count]) => count === max)
      .map(([justiceSlug, count]) => ({ justiceSlug, count }));
  }

  return {
    mostSoloConcurrences: concurrence.solo,
    mostJoinedConcurrence: concurrence.mostJoined,
    mostSoloDissents: dissent.solo,
    mostJoinedDissent: dissent.mostJoined,
    casesByJusticeAndCategory,
    mostJoinedConcurrences: mostJoined(isConcurrence),
    mostJoinedDissents: mostJoined(isDissent),
  };
}

export interface JusticeJoinPair {
  authorSlug: string;
  joinerSlug: string;
  count: number;
}

/**
 * Opinions section, "Alignment" > "Joiners" menu item: for every concurrence
 * this term, who joined whom -- authorSlug is the concurrence's author,
 * joinerSlug is a justice who joined it, count is how many of that
 * author's concurrences this term that joiner joined. Directional (author
 * x joiner is not symmetric the way pairwise agreement is), so this is a
 * flat list of pairs rather than the triangular shape getJusticeAgreementGrid
 * uses -- the UI builds a full 9x9 grid from it, author rows x joiner
 * columns, self-pairs excluded (a justice can't join their own opinion).
 */
export async function getConcurrenceJoinMatrix(term: string = currentTermYear()): Promise<JusticeJoinPair[]> {
  const { data: caseRows, error: caseError } = await db
    .from("cases")
    .select("id")
    .eq("term", term)
    .eq("status", "decided");
  if (caseError) throw new Error(`getConcurrenceJoinMatrix cases: ${caseError.message}`);
  const caseIds = (caseRows ?? []).map((c) => c.id);
  if (caseIds.length === 0) return [];

  const { data: opinionRows, error: opinionError } = await db
    .from("opinions")
    .select("id, kind, people!opinions_author_id_fkey ( slug )")
    .in("case_id", caseIds);
  if (opinionError) throw new Error(`getConcurrenceJoinMatrix opinions: ${opinionError.message}`);

  const concurrenceOpinions = (opinionRows ?? []).filter((o) => CONCURRENCE_KINDS.includes(o.kind));
  const opinionIds = concurrenceOpinions.map((o) => o.id);
  if (opinionIds.length === 0) return [];

  const { data: tieRows, error: tieError } = await db
    .from("decision_ties")
    .select("opinion_id, people ( slug )")
    .in("opinion_id", opinionIds)
    .eq("role", "joiner");
  if (tieError) throw new Error(`getConcurrenceJoinMatrix decision_ties: ${tieError.message}`);

  const authorSlugByOpinionId = new Map(
    concurrenceOpinions.map((o) => [o.id, o.people?.slug]).filter((entry): entry is [string, string] => !!entry[1]),
  );

  const counts = new Map<string, number>();
  for (const t of tieRows ?? []) {
    const authorSlug = authorSlugByOpinionId.get(t.opinion_id);
    const joinerSlug = t.people?.slug;
    if (!authorSlug || !joinerSlug || authorSlug === joinerSlug) continue;
    const key = `${authorSlug}|${joinerSlug}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([key, count]) => {
    const [authorSlug, joinerSlug] = key.split("|");
    return { authorSlug, joinerSlug, count };
  });
}
