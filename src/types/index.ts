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

  // Metadata
  processedAt: string;
  podcastEpisodeUrl?: string;
}

export interface ProcessingResult {
  case: CaseSummary;
  newTerms: LegalTerm[];
  newPrecedents: PrecedentCase[];
}
