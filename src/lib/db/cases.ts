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
import { JUSTICE_KEY_BY_PERSON_SLUG } from "./constants";
import type { CaseSummary } from "@/types";

export interface LowerCourtInfo {
  docketNumber: string | null;
  courtName: string;
  courtLevel: string;
  circuitOrdinal: number | null;
  state: string | null;
}

export interface DbCaseDetail extends CaseSummary {
  disposition: string | null;
  voteLine: string | null;
  lowerCourts: LowerCourtInfo[];
  fullTextByOpinionId: Record<string, string>;
  transcriptText: string | null;
  transcriptSourceUrl: string | null;
  spotifyMatchMethod: "docket" | "title" | null;
  spotifyMatchConfidence: number | null;
}

const CONCURRENCE_KINDS = new Set(["concurrence", "concurrence_in_judgment", "concurrence_in_part"]);
const DISSENT_KINDS = new Set(["dissent", "dissent_in_part"]);

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
  case_lower_courts ( docket_number, courts ( name, level, circuit_ordinal, state ) ),
  opinions ( id, kind, author_id, summary, full_text, people!opinions_author_id_fkey ( slug ) ),
  oral_argument_transcripts ( transcript_text, source_url ),
  case_podcast_episodes ( episode_url, match_method, match_confidence )
`;

interface DecisionTieRow {
  opinion_id: string;
  role: string;
  people: { slug: string } | null;
}

type CaseDetailRow = NonNullable<
  Awaited<ReturnType<typeof fetchOneCaseDetailRow>>["data"]
>;

async function fetchOneCaseDetailRow(slug: string) {
  return db.from("cases").select(CASE_DETAIL_SELECT).eq("slug", slug).eq("term", "2025").eq("status", "decided").maybeSingle();
}

function buildCaseDetail(caseRow: CaseDetailRow, ties: DecisionTieRow[]): DbCaseDetail {
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
    } else if (o.kind === "per_curiam") {
      majorityAuthor = "per_curiam";
      majorityOpinionSummary = o.summary ?? undefined;
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

  const lowerCourts: LowerCourtInfo[] = (caseRow.case_lower_courts ?? []).map((c) => ({
    docketNumber: c.docket_number,
    courtName: c.courts?.name ?? "Unknown court",
    courtLevel: c.courts?.level ?? "unknown",
    circuitOrdinal: c.courts?.circuit_ordinal ?? null,
    state: c.courts?.state ?? null,
  }));

  const transcript = caseRow.oral_argument_transcripts ?? null;
  const spotify = caseRow.case_podcast_episodes ?? null;

  const caseSummary: DbCaseDetail = {
    slug: caseRow.slug,
    caseNumber: caseRow.docket_number ?? "",
    title: caseRow.caption,
    termYear: caseRow.term ?? "2025",
    argumentDate: caseRow.argued_date ?? "",
    transcriptUrl: transcript?.source_url ?? "",
    docketStatus: "decided",
    backgroundAndFacts: caseRow.background ?? "",
    legalQuestion: caseRow.question_presented ?? "",
    significance: caseRow.significance ?? "",
    parties: [],
    citedPrecedents: [],
    legalTermsUsed: [],
    majorityAuthor,
    concurrenceAuthors: concurrenceAuthors.length ? concurrenceAuthors : undefined,
    dissentAuthors: dissentAuthors.length ? dissentAuthors : undefined,
    concurDissentAuthors: concurDissentAuthors.length ? concurDissentAuthors : undefined,
    pluralityAuthor,
    pluralityJoinedBy,
    decisionDate: caseRow.decided_date ?? undefined,
    majorityOpinionSummary,
    pluralityOpinionSummary,
    concurringSummaries: concurringSummaries.length ? concurringSummaries : undefined,
    dissentSummaries: dissentSummaries.length ? dissentSummaries : undefined,
    concurDissentSummaries: concurDissentSummaries.length ? concurDissentSummaries : undefined,
    processedAt: caseRow.updated_at,
    podcastEpisodeUrl: spotify?.episode_url ?? undefined,

    disposition: caseRow.disposition,
    voteLine: caseRow.vote_line,
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
 * OT2025 case with this slug exists in the DB.
 */
export async function getCaseDetail(slug: string): Promise<DbCaseDetail | null> {
  const { data: caseRow, error: caseError } = await fetchOneCaseDetailRow(slug);
  if (caseError) throw new Error(`getCaseDetail(${slug}): ${caseError.message}`);
  if (!caseRow) return null;

  const { data: ties, error: tiesError } = await db
    .from("decision_ties")
    .select("opinion_id, role, people ( slug )")
    .eq("case_id", caseRow.id);
  if (tiesError) throw new Error(`getCaseDetail(${slug}) decision_ties: ${tiesError.message}`);

  return buildCaseDetail(caseRow, ties ?? []);
}

/**
 * Fetch every decided OT2025 case's full detail in 2 bulk queries (not N+1
 * per-case round trips) -- used by scotusdashboard2's page.tsx to build
 * its full case list, including cases with no data/cases/*.json file at
 * all (e.g. Zorn v. Linton).
 */
export async function getAllCaseDetails(): Promise<DbCaseDetail[]> {
  const { data: caseRows, error: caseError } = await db
    .from("cases")
    .select(CASE_DETAIL_SELECT)
    .eq("term", "2025")
    .eq("status", "decided");
  if (caseError) throw new Error(`getAllCaseDetails: ${caseError.message}`);
  if (!caseRows?.length) return [];

  const { data: allTies, error: tiesError } = await db
    .from("decision_ties")
    .select("case_id, opinion_id, role, people ( slug )")
    .in(
      "case_id",
      caseRows.map((c) => c.id),
    );
  if (tiesError) throw new Error(`getAllCaseDetails decision_ties: ${tiesError.message}`);

  const tiesByCaseId = new Map<string, DecisionTieRow[]>();
  for (const t of allTies ?? []) {
    const list = tiesByCaseId.get(t.case_id) ?? [];
    list.push(t);
    tiesByCaseId.set(t.case_id, list);
  }

  return caseRows.map((caseRow) => buildCaseDetail(caseRow, tiesByCaseId.get(caseRow.id) ?? []));
}

export interface DbCaseListItem {
  slug: string;
  caption: string;
  docketNumber: string | null;
  decidedDate: string | null;
}

/** Every decided OT2025 case's slug/caption -- for generateStaticParams and
 *  list views. Does not include the full opinion structure (see
 *  getCaseDetail for that, called per-slug). */
export async function getAllDecidedCaseSlugs(): Promise<DbCaseListItem[]> {
  const { data, error } = await db
    .from("cases")
    .select("slug, caption, docket_number, decided_date")
    .eq("term", "2025")
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
