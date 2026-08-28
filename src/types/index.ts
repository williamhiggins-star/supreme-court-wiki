// Core data types for the Supreme Court Wiki

export interface LegalTerm {
  slug: string;
  term: string;
  definition: string;
  examples?: string[];
  relatedTerms?: string[];
}

export interface PrecedentPartyArgument {
  party: string;
  role: "petitioner" | "respondent";
  coreArgument: string;
  supportingPoints: string[];
}

export interface DissentingOpinion {
  author: string;
  joinedBy: string[];
  coreArgument: string;
  keyPoints: string[];
}

export interface PrecedentCase {
  slug: string;
  name: string;
  citation: string;
  year: number;
  // Always present (generated when first cited in a transcript)
  summary: string;
  significance: string;
  topics: string[];
  // Optional: the deciding court, when it's not the U.S. Supreme Court (a
  // circuit court of appeals or a state's highest court, cited within a
  // SCOTUS transcript/opinion as authority). Omitted (not defaulted to a
  // string) when the precedent is a SCOTUS case, so existing files don't
  // need to be touched. Also used for genuinely non-case citations (e.g. a
  // statute) that were miscategorized as a "precedent case" upstream.
  court?: string;
  // Full wiki fields — present after enrichment script runs
  legalQuestion?: string;
  backgroundAndFacts?: string;
  parties?: PrecedentPartyArgument[];
  holding?: string;
  voteCount?: string;
  majorityAuthor?: string;
  dissentingOpinions?: DissentingOpinion[];
  concurringNote?: string;
}

export interface JusticeExchange {
  justice: string;
  question: string;
  context: string;
  significance: string;
}

export interface PartyArgument {
  party: string;
  role: "petitioner" | "respondent" | "amicus";
  coreArgument: string;
  supportingPoints: string[];
  keyExchanges: JusticeExchange[];
}

export interface CitedPrecedent {
  caseSlug: string;
  caseName: string;
  citation: string;
  reasonCited: string;
  citedBy: "petitioner" | "respondent" | "court" | "multiple";
}

export interface CaseSummary {
  slug: string;
  caseNumber: string;
  title: string;
  termYear: string;
  argumentDate: string;
  transcriptUrl: string;
  docketStatus?: "upcoming" | "petition" | "emergency" | "decided";

  // AI-generated content
  backgroundAndFacts: string;
  legalQuestion: string;
  significance: string;

  parties: PartyArgument[];
  citedPrecedents: CitedPrecedent[];
  legalTermsUsed: string[]; // slugs into LegalTerm
  outcome?: string;
  petitionerWon?: boolean | null; // true=petitioner won, false=respondent won, null=unknown
  majorityAuthor?: string;        // justice key e.g. "kagan", or "per_curiam"
  concurrenceAuthors?: string[];  // justice keys
  dissentAuthors?: string[];      // justice keys
  decisionDate?: string;          // YYYY-MM-DD when the opinion was issued
  majorityOpinionSummary?: string;
  concurringSummaries?: { author: string; summary: string }[];
  dissentSummaries?: { author: string; summary: string }[];

  // Metadata
  processedAt: string;
  podcastEpisodeUrl?: string;
}

export interface ProcessingResult {
  case: CaseSummary;
  newTerms: LegalTerm[];
  newPrecedents: PrecedentCase[];
}

export interface Article {
  id: string;               // sha1(url).slice(0,16)
  title: string;
  url: string;
  source: string;           // "SCOTUSblog", "The Atlantic", etc.
  sourceDomain: string;     // "scotusblog.com"
  publishedAt: string;      // YYYY-MM-DD
  author?: string;          // byline from RSS feed, if available
  summary: string;          // Claude 2–3 sentence summary
  relatedCaseSlugs: string[];
}

export interface ArticlesData {
  generated: string;
  articles: Article[];
}

// ── Circuit splits ─────────────────────────────────────────────────────────
// Canonical definitions. Previously duplicated in src/lib/circuit-splits.ts and
// scripts/fetch-circuit-splits.ts; both now import from here.

export interface CircuitCaseRef {
  key: string;
  name: string;
  shortName: string;
  caseName: string;
  year: number;
  citation?: string;
  url: string;
}

export interface CircuitPosition {
  label: string;
  summary: string;
  circuits: CircuitCaseRef[];
}

export interface CircuitSplit {
  id: string;
  legalQuestion: string;
  description: string;
  area: string;
  positions: CircuitPosition[];
  status: "open" | "scotus_pending" | "scotus_resolved";
  relatedScotusSlug?: string | null;
  relatedScotusTitle?: string | null;
  lastUpdated: string;
}

export interface CircuitSplitsData {
  generated: string;
  splits: CircuitSplit[];
}
