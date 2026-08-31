/**
 * cases.ts — case detail, opinion structure, and decisions, reshaped from
 * the normalized Supabase schema back into the SAME CaseSummary shape
 * src/lib/decisionSides.ts's computeDecisionSides() already consumes.
 *
 * This file's entire job is the reshape (relational rows -> flat
 * majorityAuthor/concurrenceAuthors/dissentSummaries[].joinedBy, etc.).
 * It does NOT classify who's on which side, who authored vs. joined, or
 * what ring color/role label a justice gets -- computeDecisionSides()
 * already does that correctly and is reused completely unchanged. Adding
 * a second classification implementation here is exactly the mistake
 * that caused the original ring-color bug (a justice who only joined an
 * opinion, without writing one, silently defaulting to the majority
 * ring) -- see decisionSides.ts's own header comment.
 */

import { db } from "./client";
import { JUSTICE_KEY_BY_PERSON_SLUG, JUSTICE_DISPLAY_NAME_BY_KEY, currentTermYear } from "./constants";
import type { CaseSummary } from "@/types";

export interface LowerCourtInfo {
  docketNumber: string | null;
  courtName: string;
  courtLevel: string;
  circuitOrdinal: number | null;
  state: string | null;
}

export interface IssueCategoryRef {
  slug: string;
  label: string;
}

export interface DbCaseDetail extends CaseSummary {
  disposition: string | null;
  voteLine: string | null;
  issueCategory: IssueCategoryRef | null;
  lowerCourts: LowerCourtInfo[];
  fullTextByOpinionId: Record<string, string>;
  transcriptText: string | null;
  transcriptSourceUrl: string | null;
  spotifyMatchMethod: "docket" | "title" | null;
  spotifyMatchConfidence: number | null;
}

export const CONCURRENCE_KINDS = new Set(["concurrence", "concurrence_in_judgment", "concurrence_in_part"]);
export const DISSENT_KINDS = new Set(["dissent", "dissent_in_part"]);

// public.decisions.position values that put a justice on the winning side
// of a case -- the ground-truth per-justice-per-case record (one row per
// participating justice), distinct from (and more complete than) deriving
// "who dissented" from opinions/decision_ties: that reconstruction only
// counts justices who separately AUTHORED a dissent, silently missing
// anyone who joined another justice's dissent without writing their own
// (confirmed against real data -- see src/app/page.tsx's buildDecidedList
// comment on the same class of bug for vote-split display).
const MAJORITY_SIDE_POSITIONS = new Set(["majority", "plurality", "concurrence"]);

// cases.status -> CaseSummary.docketStatus. 'argued' is deliberately
// omitted -- CaseSummary.docketStatus has no "argued" literal; getDocketStatus()
// (src/app/page.tsx) already derives "argued" from argumentDate being in
// the past whenever docketStatus isn't set to something more specific,
// the same way it's always worked for JSON-sourced cases. 'historic'/
// 'stub' rows are precedent-citation stubs, not real docket entries --
// never reach this function (filtered out by getAllCasesForTerm below).
const DOCKET_STATUS_BY_DB_STATUS: Record<string, CaseSummary["docketStatus"]> = {
  decided: "decided",
  petition: "petition",
  upcoming: "upcoming",
};

function justiceKey(personSlug: string | null): string | null {
  return personSlug ? (JUSTICE_KEY_BY_PERSON_SLUG[personSlug] ?? null) : null;
}

interface OpinionSummaryEntry {
  author: string;
  summary: string;
  joinedBy: string[];
}

/**
 * Fetch one case's full detail (metadata + opinion structure + decisions +
 * lower court + transcript + Spotify) and reshape it into a
 * computeDecisionSides()-compatible object. Returns null if no case with
 * this slug exists (decided OT2025 cases only -- this data layer doesn't
 * cover upcoming/argued cases, which still read from JSON).
 */
const CASE_DETAIL_SELECT = `
  id, slug, caption, docket_number, term, status,
  question_presented, background, significance,
  argued_date, decided_date, vote_line, disposition, updated_at,
  petitioner_name, petitioner_argument, petitioner_supporting_points,
  respondent_name, respondent_argument, respondent_supporting_points,
  case_lower_courts ( docket_number, courts ( name, level, circuit_ordinal, state ) ),
  issue_category:issue_categories ( slug, label ),
  opinions ( id, kind, author_id, summary, full_text, full_text_url, people!opinions_author_id_fkey ( slug ) ),
  oral_argument_transcripts ( transcript_text, source_url ),
  case_podcast_episodes ( episode_url, match_method, match_confidence ),
  key_exchanges (
    role, exchange, context, significance,
    justice:people!key_exchanges_justice_id_fkey ( slug ),
    advocate:people!key_exchanges_advocate_id_fkey ( full_name )
  )
`;

interface DecisionTieRow {
  opinion_id: string;
  role: string;
  people: { slug: string } | null;
}

interface DecisionRow {
  position: string;
  people: { slug: string } | null;
}

type CaseDetailRow = NonNullable<
  Awaited<ReturnType<typeof fetchOneCaseDetailRow>>["data"]
>;

async function fetchOneCaseDetailRow(slug: string, term: string) {
  return db.from("cases").select(CASE_DETAIL_SELECT).eq("slug", slug).eq("term", term).eq("status", "decided").maybeSingle();
}

function buildCaseDetail(caseRow: CaseDetailRow, ties: DecisionTieRow[], decisions: DecisionRow[]): DbCaseDetail {
  const joinersByOpinionId = new Map<string, string[]>();
  for (const t of ties) {
    if (t.role !== "joiner") continue;
    const key = justiceKey(t.people?.slug ?? null);
    if (!key) continue;
    const list = joinersByOpinionId.get(t.opinion_id) ?? [];
    list.push(key);
    joinersByOpinionId.set(t.opinion_id, list);
  }

  const opinions = caseRow.opinions ?? [];
  const fullTextByOpinionId: Record<string, string> = {};

  let majorityAuthor: string | undefined;
  let majorityOpinionSummary: string | undefined;
  let majorityOpinionFullTextUrl: string | undefined;
  let pluralityAuthor: string | undefined;
  let pluralityJoinedBy: string[] | undefined;
  let pluralityOpinionSummary: string | undefined;
  const concurDissentAuthors: string[] = [];
  const concurDissentSummaries: OpinionSummaryEntry[] = [];
  const concurrenceAuthors: string[] = [];
  const concurringSummaries: OpinionSummaryEntry[] = [];
  const dissentAuthors: string[] = [];
  const dissentSummaries: OpinionSummaryEntry[] = [];

  for (const o of opinions) {
    if (o.full_text) fullTextByOpinionId[o.id] = o.full_text;
    const author = justiceKey(o.people?.slug ?? null);
    const joinedBy = joinersByOpinionId.get(o.id) ?? [];

    if (o.kind === "majority") {
      majorityAuthor = author ?? undefined;
      majorityOpinionSummary = o.summary ?? undefined;
      majorityOpinionFullTextUrl = o.full_text_url ?? undefined;
    } else if (o.kind === "per_curiam") {
      majorityAuthor = "per_curiam";
      majorityOpinionSummary = o.summary ?? undefined;
      majorityOpinionFullTextUrl = o.full_text_url ?? undefined;
    } else if (o.kind === "plurality") {
      pluralityAuthor = author ?? undefined;
      pluralityJoinedBy = joinedBy;
      pluralityOpinionSummary = o.summary ?? undefined;
    } else if (o.kind === "concur_dissent") {
      if (author) {
        concurDissentAuthors.push(author);
        concurDissentSummaries.push({ author, summary: o.summary ?? "", joinedBy });
      }
    } else if (CONCURRENCE_KINDS.has(o.kind)) {
      if (author) {
        concurrenceAuthors.push(author);
        concurringSummaries.push({ author, summary: o.summary ?? "", joinedBy });
      }
    } else if (DISSENT_KINDS.has(o.kind)) {
      if (author) {
        dissentAuthors.push(author);
        dissentSummaries.push({ author, summary: o.summary ?? "", joinedBy });
      }
    }
  }

  const majoritySideJustices = decisions
    .filter((d) => MAJORITY_SIDE_POSITIONS.has(d.position))
    .map((d) => justiceKey(d.people?.slug ?? null))
    .filter((key): key is string => key !== null);

  const lowerCourts: LowerCourtInfo[] = (caseRow.case_lower_courts ?? []).map((c) => ({
    docketNumber: c.docket_number,
    courtName: c.courts?.name ?? "Unknown court",
    courtLevel: c.courts?.level ?? "unknown",
    circuitOrdinal: c.courts?.circuit_ordinal ?? null,
    state: c.courts?.state ?? null,
  }));

  const transcript = caseRow.oral_argument_transcripts ?? null;
  const spotify = caseRow.case_podcast_episodes ?? null;

  // key_exchanges.role (backfilled from the same JSON parties[].role match
  // that produced context) is the party-attribution signal used here --
  // NOT advocate_id -> case_participations. case_participations coverage
  // is incomplete (confirmed: 59 of the (case, role) pairs among OT2025
  // rows have no matching entry at all, including Trump v. Slaughter's
  // own respondent side), so deriving bucketing from it would silently
  // drop real exchanges whose party we do actually know. advocate_id is
  // fetched here (people!key_exchanges_advocate_id_fkey) as best-effort
  // metadata, but JusticeExchange (src/types/index.ts) has no advocate
  // field and PartyExchangesPanel never rendered one -- not surfaced in
  // the UI, since that would be new structure, not a port of the old one.
  //
  // The old UI (PartyExchangesPanel, CaseDetailPanels.tsx) has no
  // "amicus" tab at all -- getCaseMenuItems() only checks
  // hasPetitioner/hasRespondent, so an amicus party's exchanges were
  // never visible anywhere even in the JSON-sourced version. Matched
  // here by simply never building an "amicus" party (petitioner_name/
  // respondent_name are the only two DB columns for party identity;
  // amicus key_exchanges rows are read but have nowhere to attach and
  // are dropped, same as the old site's actual behavior).
  const exchangesByRole = new Map<string, { justice: string; question: string; context: string; significance: string }[]>();
  for (const ex of caseRow.key_exchanges ?? []) {
    if (ex.role !== "petitioner" && ex.role !== "respondent") continue;
    const justiceDisplayName = JUSTICE_DISPLAY_NAME_BY_KEY[justiceKey(ex.justice?.slug ?? null) ?? ""] ?? "Justice";
    const list = exchangesByRole.get(ex.role) ?? [];
    list.push({
      justice: justiceDisplayName,
      question: ex.exchange,
      context: ex.context ?? "",
      significance: ex.significance ?? "",
    });
    exchangesByRole.set(ex.role, list);
  }

  const parties: CaseSummary["parties"] = [];
  if (caseRow.petitioner_name) {
    parties.push({
      party: caseRow.petitioner_name,
      role: "petitioner",
      coreArgument: caseRow.petitioner_argument ?? "",
      supportingPoints: (caseRow.petitioner_supporting_points as string[] | null) ?? [],
      keyExchanges: exchangesByRole.get("petitioner") ?? [],
    });
  }
  if (caseRow.respondent_name) {
    parties.push({
      party: caseRow.respondent_name,
      role: "respondent",
      coreArgument: caseRow.respondent_argument ?? "",
      supportingPoints: (caseRow.respondent_supporting_points as string[] | null) ?? [],
      keyExchanges: exchangesByRole.get("respondent") ?? [],
    });
  }

  const caseSummary: DbCaseDetail = {
    slug: caseRow.slug,
    caseNumber: caseRow.docket_number ?? "",
    title: caseRow.caption,
    termYear: caseRow.term ?? currentTermYear(),
    argumentDate: caseRow.argued_date ?? "",
    transcriptUrl: transcript?.source_url ?? "",
    docketStatus: DOCKET_STATUS_BY_DB_STATUS[caseRow.status],
    backgroundAndFacts: caseRow.background ?? "",
    legalQuestion: caseRow.question_presented ?? "",
    significance: caseRow.significance ?? "",
    parties,
    citedPrecedents: [],
    legalTermsUsed: [],
    majorityAuthor,
    concurrenceAuthors: concurrenceAuthors.length ? concurrenceAuthors : undefined,
    dissentAuthors: dissentAuthors.length ? dissentAuthors : undefined,
    concurDissentAuthors: concurDissentAuthors.length ? concurDissentAuthors : undefined,
    majoritySideJustices,
    pluralityAuthor,
    pluralityJoinedBy,
    decisionDate: caseRow.decided_date ?? undefined,
    majorityOpinionSummary,
    majorityOpinionFullTextUrl,
    pluralityOpinionSummary,
    concurringSummaries: concurringSummaries.length ? concurringSummaries : undefined,
    dissentSummaries: dissentSummaries.length ? dissentSummaries : undefined,
    concurDissentSummaries: concurDissentSummaries.length ? concurDissentSummaries : undefined,
    processedAt: caseRow.updated_at,
    podcastEpisodeUrl: spotify?.episode_url ?? undefined,

    disposition: caseRow.disposition,
    voteLine: caseRow.vote_line,
    issueCategory: caseRow.issue_category,
    lowerCourts,
    fullTextByOpinionId,
    transcriptText: transcript?.transcript_text ?? null,
    transcriptSourceUrl: transcript?.source_url ?? null,
    spotifyMatchMethod: (spotify?.match_method as "docket" | "title" | undefined) ?? null,
    spotifyMatchConfidence: spotify?.match_confidence ?? null,
  };

  return caseSummary;
}

/**
 * Fetch one case's full detail (metadata + opinion structure + decisions +
 * lower court + transcript + Spotify), reshaped into a
 * computeDecisionSides()-compatible object. Returns null if no decided
 * case with this slug exists in the DB for the given term (defaults to
 * the current term, so callers don't need to know/pass it for today's
 * cases -- pass one explicitly for a past or future term).
 */
export async function getCaseDetail(slug: string, term: string = currentTermYear()): Promise<DbCaseDetail | null> {
  const { data: caseRow, error: caseError } = await fetchOneCaseDetailRow(slug, term);
  if (caseError) throw new Error(`getCaseDetail(${slug}): ${caseError.message}`);
  if (!caseRow) return null;

  const { data: ties, error: tiesError } = await db
    .from("decision_ties")
    .select("opinion_id, role, people ( slug )")
    .eq("case_id", caseRow.id);
  if (tiesError) throw new Error(`getCaseDetail(${slug}) decision_ties: ${tiesError.message}`);

  const { data: decisions, error: decisionsError } = await db
    .from("decisions")
    .select("position, people ( slug )")
    .eq("case_id", caseRow.id);
  if (decisionsError) throw new Error(`getCaseDetail(${slug}) decisions: ${decisionsError.message}`);

  return buildCaseDetail(caseRow, ties ?? [], decisions ?? []);
}

/**
 * Fetch every docket-relevant case (petition/upcoming/argued/decided --
 * NOT the historic/stub precedent-citation stub rows) for one term, in 2
 * bulk queries (not N+1 per-case round trips). This is the sole source
 * for scotusdashboard2's Docket panels and /docket/[column] -- no more
 * JSON fallback; includes cases with no data/cases/*.json file at all
 * (e.g. Zorn v. Linton).
 *
 * Companion-docket cases (a consolidated case's non-primary docket --
 * e.g. Little v. Hecox, folded into West Virginia v. B.P.J.'s
 * case_lower_courts per coding-rules.md §8) are excluded via
 * term_stats_companion_cases: their own case_id carries real content
 * (commentary, key exchanges, citations) but no opinions/decisions of
 * its own, so listing it separately alongside its primary case would
 * both double-count it and render as an empty, decision-less entry.
 */
export async function getAllCasesForTerm(term: string = currentTermYear()): Promise<DbCaseDetail[]> {
  const { data: companionRows, error: companionError } = await db
    .from("term_stats_companion_cases")
    .select("case_id")
    .eq("term", term);
  if (companionError) throw new Error(`getAllCasesForTerm companions: ${companionError.message}`);
  const companionIds = new Set((companionRows ?? []).map((r) => r.case_id));

  const { data: caseRows, error: caseError } = await db
    .from("cases")
    .select(CASE_DETAIL_SELECT)
    .eq("term", term)
    .in("status", ["petition", "upcoming", "argued", "decided"]);
  if (caseError) throw new Error(`getAllCasesForTerm: ${caseError.message}`);
  const rows = (caseRows ?? []).filter((c) => !companionIds.has(c.id));
  if (!rows.length) return [];

  const { data: allTies, error: tiesError } = await db
    .from("decision_ties")
    .select("case_id, opinion_id, role, people ( slug )")
    .in(
      "case_id",
      rows.map((c) => c.id),
    );
  if (tiesError) throw new Error(`getAllCasesForTerm decision_ties: ${tiesError.message}`);

  const tiesByCaseId = new Map<string, DecisionTieRow[]>();
  for (const t of allTies ?? []) {
    const list = tiesByCaseId.get(t.case_id) ?? [];
    list.push(t);
    tiesByCaseId.set(t.case_id, list);
  }

  const { data: allDecisions, error: decisionsError } = await db
    .from("decisions")
    .select("case_id, position, people ( slug )")
    .in(
      "case_id",
      rows.map((c) => c.id),
    );
  if (decisionsError) throw new Error(`getAllCasesForTerm decisions: ${decisionsError.message}`);

  const decisionsByCaseId = new Map<string, DecisionRow[]>();
  for (const d of allDecisions ?? []) {
    const list = decisionsByCaseId.get(d.case_id) ?? [];
    list.push(d);
    decisionsByCaseId.set(d.case_id, list);
  }

  return rows.map((caseRow) => buildCaseDetail(caseRow, tiesByCaseId.get(caseRow.id) ?? [], decisionsByCaseId.get(caseRow.id) ?? []));
}

export interface DbCaseListItem {
  slug: string;
  caption: string;
  docketNumber: string | null;
  decidedDate: string | null;
}

/** Every decided case's slug/caption for one term (defaults to the current
 *  term) -- for generateStaticParams and list views. Does not include the
 *  full opinion structure (see getCaseDetail for that, called per-slug). */
export async function getAllDecidedCaseSlugs(term: string = currentTermYear()): Promise<DbCaseListItem[]> {
  const { data, error } = await db
    .from("cases")
    .select("slug, caption, docket_number, decided_date")
    .eq("term", term)
    .eq("status", "decided")
    .order("decided_date", { ascending: false });
  if (error) throw new Error(`getAllDecidedCaseSlugs: ${error.message}`);
  return (data ?? []).map((c) => ({
    slug: c.slug,
    caption: c.caption,
    docketNumber: c.docket_number,
    decidedDate: c.decided_date,
  }));
}

/** Every issue category (Feldman's Stat Pack classification, backfilled
 *  for OT2025 decided cases), alphabetical by label -- for populating the
 *  "Issue" filter's dropdown. Not term-scoped: the lookup table itself
 *  isn't, and there's no per-term reason to filter it. */
export async function getIssueCategories(): Promise<IssueCategoryRef[]> {
  const { data, error } = await db.from("issue_categories").select("slug, label").order("label");
  if (error) throw new Error(`getIssueCategories: ${error.message}`);
  return data ?? [];
}
