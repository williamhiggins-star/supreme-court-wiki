#!/usr/bin/env tsx
/**
 * backfill-db.ts — Phase 2 (SUPABASE_PLAN.md §2): one-time backfill of
 * data/*.json into the Phase 1 relational schema.
 *
 * Default mode is a dry run: reads data/*.json AND the current state of the
 * remote DB (to resolve FKs against what Phase 1 already seeded), builds the
 * full set of rows that WOULD be written, and prints a report — no writes.
 * Pass --apply to actually upsert everything.
 *
 * Every slug/name reference that doesn't resolve to a real (existing or
 * newly-created-in-this-run) row gets a stub row instead of being dropped,
 * mirroring how the existing JSON pipeline stubs unknown precedents. Where a
 * source field has no column to land in under the Phase 1 schema, or the
 * mapping requires a non-obvious judgment call, this script does NOT invent
 * a place for it — it tracks the gap and surfaces it in the report instead.
 * See the "SCHEMA GAPS / DESIGN DECISIONS" section printed at the end of the
 * dry-run report for the full list.
 *
 * Run:
 *   npx tsx scripts/backfill-db.ts              # dry run (default)
 *   npx tsx scripts/backfill-db.ts --dry-run     # dry run (explicit)
 *   npx tsx scripts/backfill-db.ts --apply       # actually write
 */

import * as fs from "fs";
import * as path from "path";
import { getCredentials, type SupabaseCredentials } from "./lib/supabase-sync/env.js";
import { select, upsert, insert } from "./lib/supabase-sync/client.js";
import { toSlug } from "./pipeline.js";
import type {
  CaseSummary,
  PrecedentCase,
  LegalTerm,
  ArticlesData,
  CircuitSplitsData,
  CircuitSplit,
} from "../src/types/index.js";

// ---------------------------------------------------------------------------
// Paths / flags
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const APPLY = process.argv.includes("--apply");

function readJsonDir<T>(dir: string): T[] {
  const full = path.join(DATA_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(full, f), "utf-8")) as T);
}

function readJsonFile<T>(file: string): T | null {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

// ---------------------------------------------------------------------------
// Static reference maps
// ---------------------------------------------------------------------------

/** Justice key (as used in case JSON's majorityAuthor/concurrenceAuthors/dissentAuthors and
 *  key_exchanges' free-text labels) -> the people.slug seeded in Phase 1. */
const JUSTICE_KEY_TO_SLUG: Record<string, string> = {
  roberts: "john-roberts",
  thomas: "clarence-thomas",
  alito: "samuel-alito",
  sotomayor: "sonia-sotomayor",
  kagan: "elena-kagan",
  gorsuch: "neil-gorsuch",
  kavanaugh: "brett-kavanaugh",
  barrett: "amy-coney-barrett",
  jackson: "ketanji-brown-jackson",
};

const JUSTICE_LAST_NAMES: Record<string, string> = {
  roberts: "roberts",
  thomas: "thomas",
  alito: "alito",
  sotomayor: "sotomayor",
  kagan: "kagan",
  gorsuch: "gorsuch",
  kavanaugh: "kavanaugh",
  barrett: "barrett",
  jackson: "jackson",
};

/** Resolve a free-text key_exchanges "justice" label (e.g. "Chief Justice Roberts",
 *  "Justice Kagan") to a JUSTICE_KEY_TO_SLUG key, by last-name substring match —
 *  same technique scripts/compute-justice-stats.ts already uses. */
function resolveJusticeLabel(label: string): string | null {
  const up = label.toUpperCase();
  for (const [key, lastName] of Object.entries(JUSTICE_LAST_NAMES)) {
    if (up.includes(lastName.toUpperCase())) return key;
  }
  return null;
}

const CIRCUIT_KEY_TO_COURT_SLUG: Record<string, string> = {
  ca1: "first-circuit",
  ca2: "second-circuit",
  ca3: "third-circuit",
  ca4: "fourth-circuit",
  ca5: "fifth-circuit",
  ca6: "sixth-circuit",
  ca7: "seventh-circuit",
  ca8: "eighth-circuit",
  ca9: "ninth-circuit",
  ca10: "tenth-circuit",
  ca11: "eleventh-circuit",
  cadc: "dc-circuit",
  cafc: "federal-circuit",
};

/** Maps the exact `court` display strings written into
 *  data/precedents/*.json (see the precedent-data-fix commit) to the
 *  matching Phase-1-seeded courts.slug. Deliberately a small hardcoded
 *  table, not a fuzzy matcher — these are the specific verified strings
 *  this script itself wrote. */
const PRECEDENT_COURT_TEXT_TO_SLUG: Record<string, string> = {
  "U.S. Court of Appeals for the Ninth Circuit": "ninth-circuit",
  "U.S. Court of Appeals for the Federal Circuit": "federal-circuit",
  "U.S. Court of Appeals for the Eleventh Circuit": "eleventh-circuit",
  "U.S. Court of Appeals for the Sixth Circuit": "sixth-circuit",
  "Supreme Court of Illinois": "illinois-supreme-court",
  "Supreme Court of Delaware": "delaware-supreme-court",
  // Added with migration 20260828120800_statutes.sql's 'state_appellate'
  // court-level addition and the matching seeds/01_courts.sql row.
  "California Court of Appeal, Second Appellate District": "california-court-of-appeal-second-appellate-district",
};

const IMPACT_AREA_MAP: Record<string, string> = {
  Securities: "securities",
  Antitrust: "antitrust",
  "Labor & Employment": "labor",
  "Intellectual Property": "ip",
  Arbitration: "arbitration",
  "Class Actions": "class_actions",
  Bankruptcy: "bankruptcy",
};

const SPLIT_STATUS_MAP: Record<string, string> = {
  open: "open",
  scotus_pending: "cert_granted",
  scotus_resolved: "resolved",
};

// ---------------------------------------------------------------------------
// Report accumulator
// ---------------------------------------------------------------------------

interface Report {
  counts: Record<string, number>;
  dangling: string[];
  flags: string[];
}

function newReport(): Report {
  return { counts: {}, dangling: [], flags: [] };
}
function bump(report: Report, table: string, n = 1) {
  report.counts[table] = (report.counts[table] ?? 0) + n;
}

// ---------------------------------------------------------------------------
// Historic opinion-author name normalization (precedents' majorityAuthor /
// dissentingOpinions[].author are free-text full names, not justice keys —
// and mostly refer to justices who are NOT among the 9 seeded in Phase 1).
// ---------------------------------------------------------------------------

interface AuthorGroup {
  groupKey: string;
  canonicalName: string;
  rawVariants: Set<string>;
  slug: string;
}

interface AuthorResolution {
  isPerCuriam: boolean;
  slug: string | null;
  fullName: string | null;
  /** true when this resolved to one of the 9 Phase-1-seeded current justices
   *  (by last-name match) rather than a newly-registered historic stub. */
  isExistingJustice: boolean;
}

function isPerCuriam(raw: string): boolean {
  return /per curiam/i.test(raw);
}

function stripAuthorTitle(raw: string): string {
  return raw
    .replace(/^(Chief\s+)?Justice\s+/i, "")
    .replace(/^Judge\s+/i, "")
    .replace(/,?\s*Jr\.?\s*$/i, "")
    .replace(/\s+II$/, " II") // keep "II" but normalize spacing
    .trim();
}

/** Grouping key: (first token, last non-suffix token), case-insensitive.
 *  Collapses "William H. Rehnquist" / "William Rehnquist" / "Justice William
 *  Rehnquist" to the same group. Documented limitation: this is a heuristic,
 *  not a verified identity match — the dry-run report prints every group's
 *  raw variants so a wrong merge is visible before --apply. */
function authorGroupKey(cleaned: string): string {
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return cleaned.toLowerCase();
  const first = words[0].toLowerCase();
  const last = words[words.length - 1].toLowerCase();
  return `${first}|${last}`;
}

class HistoricAuthorRegistry {
  private groups = new Map<string, AuthorGroup>();

  /** Registers a variant (side effect) and returns its resolution. */
  resolve(raw: string): AuthorResolution {
    if (isPerCuriam(raw)) return { isPerCuriam: true, slug: null, fullName: null, isExistingJustice: false };
    const cleaned = stripAuthorTitle(raw);

    // Already-seeded current justice? Match by last name against the 9 from
    // Phase 1 so we never create a duplicate stub for a sitting justice.
    const lastWord = cleaned.split(/\s+/).pop()?.toLowerCase() ?? "";
    for (const [justiceKey, lastName] of Object.entries(JUSTICE_LAST_NAMES)) {
      if (lastWord === lastName) {
        return { isPerCuriam: false, slug: JUSTICE_KEY_TO_SLUG[justiceKey], fullName: null, isExistingJustice: true };
      }
    }

    const key = authorGroupKey(cleaned);
    let group = this.groups.get(key);
    if (!group) {
      group = {
        groupKey: key,
        canonicalName: cleaned,
        rawVariants: new Set(),
        slug: toSlug(cleaned),
      };
      this.groups.set(key, group);
    } else if (cleaned.length > group.canonicalName.length) {
      // Prefer the fullest observed form (more tokens / middle initial) as
      // the canonical full_name.
      group.canonicalName = cleaned;
      group.slug = toSlug(cleaned);
    }
    group.rawVariants.add(raw);
    return { isPerCuriam: false, slug: group.slug, fullName: group.canonicalName, isExistingJustice: false };
  }

  allGroups(): AuthorGroup[] {
    return [...this.groups.values()];
  }
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

interface PersonRow {
  slug: string;
  full_name: string;
  short_name?: string;
  bio_summary?: string;
}
interface CaseRow {
  slug: string;
  court_slug: string; // resolved to court_id at write time
  docket_number: string | null;
  caption: string;
  term: string | null;
  status: string;
  question_presented: string | null;
  background: string | null;
  significance: string | null;
  argued_date: string | null;
  decided_date: string | null;
  vote_line: string | null;
  source_urls: string[];
  is_stub: boolean;
}
interface OpinionRow {
  case_slug: string;
  kind: string;
  author_person_slug: string | null; // null = per curiam / unresolved
  summary: string | null;
}
interface VoteRow {
  case_slug: string;
  person_slug: string;
  side: string;
}
interface OpinionJoinRow {
  case_slug: string;
  opinion_kind: string; // 'majority' | 'concurrence' | 'dissent' — identifies which opinion, together with opinion_author_slug + case_slug
  opinion_author_slug: string;
  joiner_person_slug: string;
}
interface CaseParticipationRow {
  case_slug: string;
  person_slug: string;
  role: string;
  party_name: string | null;
}
interface KeyExchangeRow {
  case_slug: string;
  justice_person_slug: string | null;
  exchange: string;
  significance: string | null;
}
interface CitationRow {
  citing_case_slug: string;
  cited_case_slug: string;
  treatment: string;
  context: string | null;
}
interface LegalTermRow {
  slug: string;
  term: string;
  definition: string;
}
interface CaseTermRow {
  case_slug: string;
  term_slug: string;
}
interface PublicationRow {
  url: string;
  kind: string;
  title: string;
  author_text: string | null;
  published_at: string | null;
  summary: string | null;
}
interface PublicationCaseRow {
  publication_url: string;
  case_slug: string;
}
interface CircuitSplitRow {
  slug: string;
  question: string;
  status: string;
  scotus_case_slug: string | null;
}
interface SplitPositionRow {
  split_slug: string;
  case_slug: string;
  position: string;
}
interface AppellateImpactRow {
  case_slug: string;
  impact_area: string;
  direction: string;
  writeup: string;
}
interface StatuteRow {
  slug: string;
  citation: string;
  name: string;
  jurisdiction: string | null;
  url: string | null;
}
interface StatuteCitationRow {
  citing_case_slug: string;
  statute_slug: string;
  context: string | null;
}

interface Model {
  people: Map<string, PersonRow>;
  cases: Map<string, CaseRow>;
  opinions: OpinionRow[];
  votes: VoteRow[];
  opinionJoins: OpinionJoinRow[];
  caseParticipations: CaseParticipationRow[];
  keyExchanges: KeyExchangeRow[];
  citations: CitationRow[];
  legalTerms: Map<string, LegalTermRow>;
  caseTerms: CaseTermRow[];
  publications: Map<string, PublicationRow>;
  publicationCases: PublicationCaseRow[];
  circuitSplits: Map<string, CircuitSplitRow>;
  splitPositions: SplitPositionRow[];
  appellateImpacts: AppellateImpactRow[];
  statutes: Map<string, StatuteRow>;
  statuteCitations: StatuteCitationRow[];
}

function newModel(): Model {
  return {
    people: new Map(),
    cases: new Map(),
    opinions: [],
    votes: [],
    opinionJoins: [],
    caseParticipations: [],
    keyExchanges: [],
    citations: [],
    legalTerms: new Map(),
    caseTerms: [],
    publications: new Map(),
    publicationCases: [],
    circuitSplits: new Map(),
    splitPositions: [],
    appellateImpacts: [],
    statutes: new Map(),
    statuteCitations: [],
  };
}

/** Same status derivation the frontend uses (src/app/page.tsx's
 *  getDocketStatus) — applied only to the 4 case files missing docketStatus. */
function deriveStatus(c: CaseSummary): string {
  if (c.docketStatus === "decided") return "decided";
  if (c.docketStatus === "petition") return "petition";
  if (c.docketStatus === "upcoming") return "upcoming";
  if (c.outcome) return "decided";
  if (!c.argumentDate) return "upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = c.argumentDate.split("-").map(Number);
  const argDate = new Date(y, m - 1, d);
  if (argDate > today) return "upcoming";
  return "argued";
}

/** Ensures a "thin" circuit-court case stub exists (for circuit_splits'
 *  backing decisions and appellate_impacts' underlying opinions) and returns
 *  its slug. Shared across both builders so the same circuit opinion cited
 *  from two places doesn't create two rows. */
function ensureCircuitCaseStub(
  model: Model,
  report: Report,
  args: { caseName: string; year: number; url: string; circuitKey: string; date?: string }
): string {
  const courtSlug = CIRCUIT_KEY_TO_COURT_SLUG[args.circuitKey];
  const slug = toSlug(`${args.caseName} ${args.year}`);
  if (!model.cases.has(slug)) {
    model.cases.set(slug, {
      slug,
      court_slug: courtSlug ?? "scotus",
      docket_number: null,
      caption: args.caseName,
      term: String(args.year),
      status: "stub",
      question_presented: null,
      background: null,
      significance: null,
      argued_date: null,
      decided_date: args.date ?? null,
      vote_line: null,
      source_urls: [args.url],
      is_stub: true,
    });
    bump(report, "cases (circuit-opinion stubs)");
    if (!courtSlug) {
      report.flags.push(`Unresolvable circuit key "${args.circuitKey}" for "${args.caseName}" — defaulted to scotus.`);
    }
  }
  return slug;
}

// ---- data/cases/*.json ------------------------------------------------

function buildFromCases(model: Model, report: Report, cases: CaseSummary[], authorRegistry: HistoricAuthorRegistry) {
  for (const c of cases) {
    const status = deriveStatus(c);
    if (!["petition", "upcoming", "argued", "decided", "historic", "stub"].includes(status)) {
      report.flags.push(`Case ${c.slug}: derived status "${status}" not in schema's status enum — needs manual handling.`);
    }
    model.cases.set(c.slug, {
      slug: c.slug,
      court_slug: "scotus",
      docket_number: c.caseNumber,
      caption: c.title,
      term: c.termYear,
      status,
      question_presented: c.legalQuestion,
      background: c.backgroundAndFacts,
      significance: c.significance,
      argued_date: c.argumentDate || null,
      decided_date: c.decisionDate ?? null,
      vote_line: null, // source JSON doesn't store a "6-3" style line for cases (only precedents' voteCount)
      source_urls: [c.transcriptUrl].filter(Boolean),
      is_stub: false,
    });
    bump(report, "cases (from data/cases)");

    // -- opinions + votes + opinion_joins ------------------------------------
    if (c.majorityAuthor) {
      if (c.majorityAuthor === "per_curiam") {
        model.opinions.push({ case_slug: c.slug, kind: "per_curiam", author_person_slug: null, summary: c.majorityOpinionSummary ?? null });
      } else {
        const slug = JUSTICE_KEY_TO_SLUG[c.majorityAuthor];
        if (!slug) {
          report.flags.push(`Case ${c.slug}: unrecognized majorityAuthor key "${c.majorityAuthor}".`);
        } else {
          model.opinions.push({ case_slug: c.slug, kind: "majority", author_person_slug: slug, summary: c.majorityOpinionSummary ?? null });
          model.votes.push({ case_slug: c.slug, person_slug: slug, side: "majority" });
          for (const joinerKey of c.majorityJoinedBy ?? []) {
            const joinerSlug = JUSTICE_KEY_TO_SLUG[joinerKey];
            if (!joinerSlug) { report.flags.push(`Case ${c.slug}: unrecognized majorityJoinedBy key "${joinerKey}".`); continue; }
            model.votes.push({ case_slug: c.slug, person_slug: joinerSlug, side: "majority" });
            model.opinionJoins.push({ case_slug: c.slug, opinion_kind: "majority", opinion_author_slug: slug, joiner_person_slug: joinerSlug });
            bump(report, "opinion_joins");
          }
        }
      }
      bump(report, "opinions");
    }

    const concurrenceSummaryAuthors = new Set((c.concurringSummaries ?? []).map((s) => s.author));
    for (const s of c.concurringSummaries ?? []) {
      const slug = JUSTICE_KEY_TO_SLUG[s.author];
      if (!slug) { report.flags.push(`Case ${c.slug}: unrecognized concurrence author key "${s.author}".`); continue; }
      model.opinions.push({ case_slug: c.slug, kind: "concurrence", author_person_slug: slug, summary: s.summary });
      model.votes.push({ case_slug: c.slug, person_slug: slug, side: "majority" });
      bump(report, "opinions");
      for (const joinerKey of s.joinedBy ?? []) {
        const joinerSlug = JUSTICE_KEY_TO_SLUG[joinerKey];
        if (!joinerSlug) { report.flags.push(`Case ${c.slug}: unrecognized concurrence joinedBy key "${joinerKey}".`); continue; }
        model.votes.push({ case_slug: c.slug, person_slug: joinerSlug, side: "majority" });
        model.opinionJoins.push({ case_slug: c.slug, opinion_kind: "concurrence", opinion_author_slug: slug, joiner_person_slug: joinerSlug });
        bump(report, "opinion_joins");
      }
    }
    for (const key of c.concurrenceAuthors ?? []) {
      if (concurrenceSummaryAuthors.has(key)) continue; // already handled above with real summary text
      const slug = JUSTICE_KEY_TO_SLUG[key];
      if (!slug) { report.flags.push(`Case ${c.slug}: unrecognized concurrenceAuthors key "${key}".`); continue; }
      model.opinions.push({ case_slug: c.slug, kind: "concurrence", author_person_slug: slug, summary: null });
      model.votes.push({ case_slug: c.slug, person_slug: slug, side: "majority" });
      bump(report, "opinions");
      report.flags.push(`Case ${c.slug}: concurrence author "${key}" has no per-author summary text — modeled as a separate opinion row (see report header note on concurrence/dissent fan-out). No joinedBy data exists for this one either (that's only captured on concurringSummaries entries).`);
    }

    const dissentSummaryAuthors = new Set((c.dissentSummaries ?? []).map((s) => s.author));
    for (const s of c.dissentSummaries ?? []) {
      const slug = JUSTICE_KEY_TO_SLUG[s.author];
      if (!slug) { report.flags.push(`Case ${c.slug}: unrecognized dissent author key "${s.author}".`); continue; }
      model.opinions.push({ case_slug: c.slug, kind: "dissent", author_person_slug: slug, summary: s.summary });
      model.votes.push({ case_slug: c.slug, person_slug: slug, side: "dissent" });
      bump(report, "opinions");
      for (const joinerKey of s.joinedBy ?? []) {
        const joinerSlug = JUSTICE_KEY_TO_SLUG[joinerKey];
        if (!joinerSlug) { report.flags.push(`Case ${c.slug}: unrecognized dissent joinedBy key "${joinerKey}".`); continue; }
        model.votes.push({ case_slug: c.slug, person_slug: joinerSlug, side: "dissent" });
        model.opinionJoins.push({ case_slug: c.slug, opinion_kind: "dissent", opinion_author_slug: slug, joiner_person_slug: joinerSlug });
        bump(report, "opinion_joins");
      }
    }
    for (const key of c.dissentAuthors ?? []) {
      if (dissentSummaryAuthors.has(key)) continue;
      const slug = JUSTICE_KEY_TO_SLUG[key];
      if (!slug) { report.flags.push(`Case ${c.slug}: unrecognized dissentAuthors key "${key}".`); continue; }
      model.opinions.push({ case_slug: c.slug, kind: "dissent", author_person_slug: slug, summary: null });
      model.votes.push({ case_slug: c.slug, person_slug: slug, side: "dissent" });
      bump(report, "opinions");
      report.flags.push(`Case ${c.slug}: dissent author "${key}" has no per-author summary text — modeled as a separate opinion row. No joinedBy data exists for this one either.`);
    }
    // -- key_exchanges -------------------------------------------------------
    for (const p of c.parties) {
      for (const ex of p.keyExchanges ?? []) {
        const justiceKey = resolveJusticeLabel(ex.justice);
        model.keyExchanges.push({
          case_slug: c.slug,
          justice_person_slug: justiceKey ? JUSTICE_KEY_TO_SLUG[justiceKey] : null,
          exchange: ex.question,
          significance: [ex.context, ex.significance].filter(Boolean).join(" "),
        });
        bump(report, "key_exchanges");
        if (!justiceKey) report.flags.push(`Case ${c.slug}: could not resolve key_exchanges justice label "${ex.justice}".`);
      }
    }

    // -- citations -------------------------------------------------------
    // cp.caseSlug is checked against the full case+precedent slug set later
    // in main(), once precedent cases have been loaded into the model.
    for (const cp of c.citedPrecedents) {
      model.citations.push({
        citing_case_slug: c.slug,
        cited_case_slug: cp.caseSlug,
        treatment: "cited", // no treatment signal in source data — see report flag
        context: cp.reasonCited,
      });
      bump(report, "citations");
    }

    // -- case_terms --------------------------------------------------------
    for (const termSlug of c.legalTermsUsed ?? []) {
      model.caseTerms.push({ case_slug: c.slug, term_slug: termSlug });
      bump(report, "case_terms");
    }
  }
}

// ---- data/precedents/*.json --------------------------------------------

/** Matches a U.S. Code / C.F.R. / Public Law citation — i.e. this
 *  "precedent" is actually a STATUTE, not an adjudicated case. Statutes
 *  don't have majority opinions or dissents; when enrich-precedents.ts ran
 *  its "write a full case entry" prompt against one anyway, Claude
 *  fabricated plausible-sounding authorship (observed: a "Democratic
 *  Congressional Minority" dissent, opinions attributed to the statute's
 *  legislative drafters). The citation to the statute itself is real and
 *  worth keeping; the invented opinion/author data is not. */
const STATUTE_CITATION_RE = /U\.S\.C\.|C\.F\.R\.|Pub\.?\s*L\./;

// SCOTUS opinions are always cited as "___ U.S. ___" (or, for very recent
// ones not yet in the bound U.S. Reports, "___ S. Ct. ___"). A citation
// matching a state or federal-circuit reporter instead is a strong signal
// this "precedent" is not actually a Supreme Court case, regardless of what
// the author-name field says.
const NON_SCOTUS_REPORTER_RE = /\d+\s+(A\.\s?\d?d|N\.E\.\s?\d?d|N\.W\.\s?\d?d|P\.\s?\d?d|S\.E\.\s?\d?d|S\.W\.\s?\d?d|So\.\s?\d?d|Cal\.\s?(Rptr\.|App\.)|F\.\s?\d?d|F\.\s?Supp)/;

function buildFromPrecedents(model: Model, report: Report, precedents: PrecedentCase[], authorRegistry: HistoricAuthorRegistry) {
  const SUSPECT_NAME_HINTS = /judge |panel|circuit/i;
  let statuteCount = 0;

  for (const p of precedents) {
    const enriched = "holding" in p && p.holding !== undefined;
    const isStatute = STATUTE_CITATION_RE.test(p.citation ?? "");

    if (isStatute) {
      statuteCount++;
      // Routes to statutes/statute_citations (migration
      // 20260828120800_statutes.sql), not cases/citations. As of the
      // precedent-data-fix commit, none of these 10 files carry fabricated
      // opinion fields any more (6 were stripped; 4 were already stubs) —
      // this branch would ignore that content even if present, since a
      // statute never has a majority opinion regardless of what the JSON says.
      model.statutes.set(p.slug, {
        slug: p.slug,
        citation: p.citation,
        name: p.name,
        jurisdiction: "federal", // STATUTE_CITATION_RE only matches U.S.C./C.F.R./Pub. L. — all federal
        url: null,
      });
      bump(report, "statutes");
      continue;
    }

    if (!enriched && NON_SCOTUS_REPORTER_RE.test(p.citation ?? "") && !p.court) {
      report.flags.push(`Precedent "${p.slug}": citation "${p.citation}" matches a state/circuit reporter format, not U.S. Reports, and has no "court" field set — could not be independently verified against a real case at that citation (see the precedent-data-fix commit message) — defaulted to court_id=scotus; needs manual review before trusting this row.`);
    }

    const courtSlug = p.court ? PRECEDENT_COURT_TEXT_TO_SLUG[p.court] : undefined;
    if (p.court && !courtSlug) {
      report.flags.push(`Precedent "${p.slug}": court "${p.court}" doesn't match any Phase-1-seeded court (the schema's court level enum has no category for an intermediate state appellate court) — defaulted to court_id=scotus.`);
    }

    model.cases.set(p.slug, {
      slug: p.slug,
      court_slug: courtSlug ?? "scotus",
      docket_number: null,
      caption: p.name,
      term: String(p.year),
      status: enriched ? "historic" : "stub",
      question_presented: p.legalQuestion ?? null,
      background: p.backgroundAndFacts ?? null,
      significance: p.significance,
      argued_date: null,
      decided_date: null, // only a year is known, not a real date — see report flag
      vote_line: p.voteCount ?? null,
      source_urls: [],
      is_stub: !enriched,
    });
    bump(report, enriched ? "cases (from data/precedents, historic)" : "cases (from data/precedents, stub)");

    if (!enriched) continue; // stubs have no opinion/author data to backfill

    if (p.majorityAuthor) {
      if (!p.court && (SUSPECT_NAME_HINTS.test(p.majorityAuthor) || /panel/i.test(p.majorityAuthor))) {
        report.flags.push(`Precedent ${p.slug}: majorityAuthor "${p.majorityAuthor}" suggests this may not actually be a SCOTUS opinion — court_id defaulted to scotus anyway; needs manual review.`);
      }
      const res = authorRegistry.resolve(p.majorityAuthor);
      model.opinions.push({
        case_slug: p.slug,
        kind: res.isPerCuriam ? "per_curiam" : "majority",
        author_person_slug: res.slug,
        summary: null,
      });
      bump(report, "opinions");
      if (res.slug && !res.isExistingJustice && !res.isPerCuriam) {
        model.people.set(res.slug, { slug: res.slug, full_name: res.fullName ?? p.majorityAuthor });
      }
    }

    for (const d of p.dissentingOpinions ?? []) {
      if (!p.court && SUSPECT_NAME_HINTS.test(d.author)) {
        report.flags.push(`Precedent ${p.slug}: dissent author "${d.author}" suggests this may not actually be a SCOTUS opinion.`);
      }
      const res = authorRegistry.resolve(d.author);
      model.opinions.push({
        case_slug: p.slug,
        kind: "dissent",
        author_person_slug: res.isPerCuriam ? null : res.slug,
        summary: d.coreArgument,
      });
      bump(report, "opinions");
      if (res.slug && !res.isExistingJustice && !res.isPerCuriam) {
        model.people.set(res.slug, { slug: res.slug, full_name: res.fullName ?? d.author });
      }
      // joinedBy is real structured data here (unlike case-JSON's flat
      // arrays) — but opinion_joins needs an opinion_id we don't have until
      // insert time. Recorded as a flag; wiring deferred to --apply.
      if (d.joinedBy?.length) {
        report.flags.push(`Precedent ${p.slug}: dissent by "${d.author}" was joined by [${d.joinedBy.join(", ")}] — opinion_joins not populated in this backfill (see SCHEMA GAPS).`);
      }
    }
  }
  if (statuteCount > 0) {
    report.flags.push(`${statuteCount} of ${precedents.length} data/precedents/*.json files are statutes (U.S.C./C.F.R./Pub. L. citation), not adjudicated cases — routed to statutes/statute_citations instead of cases/citations (see migration 20260828120800_statutes.sql).`);
  }
}

// ---- data/terms/*.json ---------------------------------------------------

function buildFromTerms(model: Model, report: Report, terms: LegalTerm[]) {
  for (const t of terms) {
    model.legalTerms.set(t.slug, { slug: t.slug, term: t.term, definition: t.definition });
    bump(report, "legal_terms");
    if (t.examples?.length || t.relatedTerms?.length) {
      // Counted once at the end instead of per-term to keep the flag list short.
    }
  }
  const withExtras = terms.filter((t) => t.examples?.length || t.relatedTerms?.length).length;
  if (withExtras > 0) {
    report.flags.push(`${withExtras} of ${terms.length} legal_terms have examples/relatedTerms data with no column to land in (legal_terms has no examples/related_terms columns) — dropped.`);
  }
}

// ---- data/articles.json ---------------------------------------------------

function buildFromArticles(model: Model, report: Report, data: ArticlesData | null, caseSlugs: Set<string>) {
  if (!data) { report.flags.push("data/articles.json not found — skipped."); return; }
  for (const a of data.articles) {
    model.publications.set(a.url, {
      url: a.url,
      kind: "journalism", // source data doesn't structurally distinguish opinion/journalism/podcast — see SCHEMA GAPS
      title: a.title,
      author_text: a.author ?? null,
      published_at: a.publishedAt,
      summary: a.summary,
    });
    bump(report, "publications");
    for (const slug of a.relatedCaseSlugs) {
      if (!caseSlugs.has(slug)) {
        report.dangling.push(`article "${a.title.slice(0, 60)}" references case slug "${slug}" which doesn't exist — edge dropped (no case to stub: we don't know enough about it to create one).`);
        continue;
      }
      model.publicationCases.push({ publication_url: a.url, case_slug: slug });
      bump(report, "publication_cases");
    }
  }
}

// ---- data/circuit-splits.json ---------------------------------------------

function buildFromCircuitSplits(model: Model, report: Report, data: CircuitSplitsData | null, caseSlugs: Set<string>) {
  if (!data) { report.flags.push("data/circuit-splits.json not found — skipped."); return; }
  for (const s of data.splits) {
    const status = SPLIT_STATUS_MAP[s.status];
    if (!status) { report.flags.push(`Circuit split ${s.id}: unrecognized status "${s.status}".`); continue; }
    let scotusSlug: string | null = null;
    if (s.relatedScotusSlug) {
      if (caseSlugs.has(s.relatedScotusSlug)) {
        scotusSlug = s.relatedScotusSlug;
      } else {
        report.dangling.push(`circuit split "${s.id}" references relatedScotusSlug "${s.relatedScotusSlug}" which doesn't exist — left null.`);
      }
    }
    model.circuitSplits.set(s.id, { slug: s.id, question: s.legalQuestion, status, scotus_case_slug: scotusSlug });
    bump(report, "circuit_splits");

    for (const pos of s.positions) {
      for (const c of pos.circuits) {
        const caseSlug = ensureCircuitCaseStub(model, report, {
          caseName: c.caseName,
          year: c.year,
          url: c.url,
          circuitKey: c.key,
        });
        model.splitPositions.push({ split_slug: s.id, case_slug: caseSlug, position: pos.label });
        bump(report, "split_positions");
      }
    }
  }
  report.flags.push(`circuit_splits: source JSON's "area" and "description" fields have no column in the circuit_splits schema (only question/status/scotus_case_id) — dropped for all ${data.splits.length} splits.`);
}

// ---- data/appellate-impacts.json -------------------------------------------

function buildFromAppellateImpacts(model: Model, report: Report, impactsPath: string) {
  const data = readJsonFile<{ generated: string; impacts: Array<{
    id: string; caseName: string; docketNumber?: string; court?: string; courtKey?: string;
    date?: string; area?: string; legalQuestion?: string; description?: string;
    positiveImplications?: string; negativeImplications?: string; url?: string;
  }> }>(impactsPath);
  if (!data) { report.flags.push(`${impactsPath} not found — skipped.`); return; }

  for (const i of data.impacts) {
    const year = i.date ? Number(i.date.slice(0, 4)) : new Date().getFullYear();
    const caseSlug = ensureCircuitCaseStub(model, report, {
      caseName: i.caseName,
      year,
      url: i.url ?? "",
      circuitKey: i.courtKey ?? "",
      date: i.date,
    });
    // legalQuestion/docketNumber are richer than what ensureCircuitCaseStub sets by
    // default (it doesn't know about appellate_impacts' extra fields) — patch them in.
    const caseRow = model.cases.get(caseSlug);
    if (caseRow) {
      caseRow.question_presented = i.legalQuestion ?? caseRow.question_presented;
      caseRow.docket_number = i.docketNumber ?? caseRow.docket_number;
    }

    const impactArea = i.area ? IMPACT_AREA_MAP[i.area] : undefined;
    if (!impactArea) { report.flags.push(`Appellate impact "${i.id}": unrecognized area "${i.area}".`); continue; }

    const positiveIsNone = /none significant/i.test(i.positiveImplications ?? "");
    const negativeIsNone = /none significant/i.test(i.negativeImplications ?? "");
    let direction: string;
    if (positiveIsNone && !negativeIsNone) direction = "business_adverse";
    else if (negativeIsNone && !positiveIsNone) direction = "business_favorable";
    else direction = "mixed"; // both present, or both "none significant" (unlikely) — mixed is the safest default

    const writeup = [i.description, i.positiveImplications ? `Positive: ${i.positiveImplications}` : null, i.negativeImplications ? `Negative: ${i.negativeImplications}` : null]
      .filter(Boolean)
      .join("\n\n");

    model.appellateImpacts.push({ case_slug: caseSlug, impact_area: impactArea, direction, writeup });
    bump(report, "appellate_impacts");
  }
  report.flags.push(`appellate_impacts.direction is INFERRED from the literal sentinel "None significant." in positiveImplications/negativeImplications text, not a sourced field — verify this reads correctly.`);
}

// ---- data/lawyers.json -> case_participations ------------------------------

function buildFromLawyers(model: Model, report: Report, cases: CaseSummary[]) {
  const data = readJsonFile<{ term: string; generated: string; lawyers: Array<{
    label: string; name: string; cases: Array<{ slug: string; side?: "petitioner" | "respondent" }>;
  }> }>("lawyers.json");
  if (!data) { report.flags.push("data/lawyers.json not found — case_participations will be empty."); return; }

  const caseBySlug = new Map(cases.map((c) => [c.slug, c]));
  let created = 0;

  for (const lawyer of data.lawyers) {
    const personSlug = toSlug(lawyer.label);
    if (!model.people.has(personSlug)) {
      model.people.set(personSlug, { slug: personSlug, full_name: lawyer.name });
      created++;
    }
    for (const cs of lawyer.cases) {
      const caseData = caseBySlug.get(cs.slug);
      if (!caseData) {
        report.dangling.push(`lawyers.json: "${lawyer.name}" case reference "${cs.slug}" doesn't exist in data/cases — skipped.`);
        continue;
      }
      const role = cs.side === "petitioner" ? "argued_petitioner" : cs.side === "respondent" ? "argued_respondent" : "on_brief";
      const partyName = caseData.parties.find((p) => p.role === cs.side)?.party ?? null;
      model.caseParticipations.push({ case_slug: cs.slug, person_slug: personSlug, role, party_name: partyName });
      bump(report, "case_participations");
    }
  }
  report.flags.push(
    `case_participations is built from data/lawyers.json (courtroom speaker labels like "Mr. Clement"), NOT from data/cases/*.json alone — that file's parties[] only names the litigant (e.g. "United States"), never the arguing attorney, so case_participations.person_id (NOT NULL) has no source without this cross-reference. This wasn't explicitly listed as a Phase 2 source for this table — flagging for your sign-off rather than assuming it. ${created} advocate people rows would be created, with full_name set to the informal courtroom label (e.g. "Mr. Clement"), not a verified full legal name.`
  );
}

// ---------------------------------------------------------------------------
// Apply — writes the model to Supabase, in FK dependency order
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Upserts in batches, merging every batch's slug->id pairs into one map. */
async function upsertAll(
  creds: SupabaseCredentials,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  keyField: string,
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  for (const batch of chunk(rows, 200)) {
    const result = await upsert<Record<string, string>>(creds, table, batch, onConflict);
    for (const r of result) idByKey.set(r[keyField], r.id);
  }
  return idByKey;
}

async function insertAll(creds: SupabaseCredentials, table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (const batch of chunk(rows, 200)) {
    await insert(creds, table, batch);
  }
}

async function applyModel(creds: SupabaseCredentials, model: Model, courtIdBySlug: Map<string, string>, personIdBySlug: Map<string, string>): Promise<void> {
  const log = (msg: string) => console.log(`[apply] ${msg}`);

  // 1. people (new historic authors + advocates)
  const newPeopleRows = [...model.people.values()].map((p) => ({ slug: p.slug, full_name: p.full_name }));
  const newPersonIds = await upsertAll(creds, "people", newPeopleRows, "slug", "slug");
  for (const [slug, id] of newPersonIds) personIdBySlug.set(slug, id);
  log(`people: +${newPeopleRows.length}`);

  // 2. cases
  const caseRows = [...model.cases.values()].map((c) => ({
    slug: c.slug,
    court_id: courtIdBySlug.get(c.court_slug),
    docket_number: c.docket_number,
    caption: c.caption,
    term: c.term,
    status: c.status,
    question_presented: c.question_presented,
    background: c.background,
    significance: c.significance,
    argued_date: c.argued_date,
    decided_date: c.decided_date,
    vote_line: c.vote_line,
    source_urls: c.source_urls,
    is_stub: c.is_stub,
  }));
  const caseIdBySlug = await upsertAll(creds, "cases", caseRows, "slug", "slug");
  log(`cases: +${caseRows.length}`);

  // 3. statutes
  const statuteRows = [...model.statutes.values()].map((s) => ({
    slug: s.slug, citation: s.citation, name: s.name, jurisdiction: s.jurisdiction, url: s.url,
  }));
  const statuteIdBySlug = await upsertAll(creds, "statutes", statuteRows, "slug", "slug");
  log(`statutes: +${statuteRows.length}`);

  // 4. opinions — plain insert (no natural unique key); capture generated
  // ids keyed by (case_slug, kind, author_slug) for opinion_joins below.
  const opinionIdByKey = new Map<string, string>();
  for (const batch of chunk(model.opinions, 200)) {
    const rows = batch.map((o) => ({
      case_id: caseIdBySlug.get(o.case_slug),
      kind: o.kind,
      author_id: o.author_person_slug ? personIdBySlug.get(o.author_person_slug) : null,
      summary: o.summary,
    }));
    const result = await insert<{ id: string; case_id: string; kind: string; author_id: string | null }>(creds, "opinions", rows);
    for (let i = 0; i < batch.length; i++) {
      const key = `${batch[i].case_slug}::${batch[i].kind}::${batch[i].author_person_slug ?? "null"}`;
      opinionIdByKey.set(key, result[i].id);
    }
  }
  log(`opinions: +${model.opinions.length}`);

  // 5. opinion_joins
  const opinionJoinRows = model.opinionJoins
    .map((j) => ({
      opinion_id: opinionIdByKey.get(`${j.case_slug}::${j.opinion_kind}::${j.opinion_author_slug}`),
      person_id: personIdBySlug.get(j.joiner_person_slug),
    }))
    .filter((r) => r.opinion_id && r.person_id);
  await insertAll(creds, "opinion_joins", opinionJoinRows);
  log(`opinion_joins: +${opinionJoinRows.length}`);

  // 6. votes — upsert on (case_id, person_id), the table's actual PK.
  const voteRows = model.votes
    .map((v) => ({ case_id: caseIdBySlug.get(v.case_slug), person_id: personIdBySlug.get(v.person_slug), side: v.side }))
    .filter((r) => r.case_id && r.person_id);
  for (const batch of chunk(voteRows, 200)) {
    await upsert(creds, "votes", batch, "case_id,person_id");
  }
  log(`votes: +${voteRows.length}`);

  // 7. case_participations
  const caseParticipationRows = model.caseParticipations
    .map((cp) => ({ case_id: caseIdBySlug.get(cp.case_slug), person_id: personIdBySlug.get(cp.person_slug), role: cp.role, party_name: cp.party_name }))
    .filter((r) => r.case_id && r.person_id);
  await insertAll(creds, "case_participations", caseParticipationRows);
  log(`case_participations: +${caseParticipationRows.length}`);

  // 8. key_exchanges
  const keyExchangeRows = model.keyExchanges.map((k) => ({
    case_id: caseIdBySlug.get(k.case_slug),
    justice_id: k.justice_person_slug ? personIdBySlug.get(k.justice_person_slug) : null,
    advocate_id: null,
    exchange: k.exchange,
    significance: k.significance,
  }));
  await insertAll(creds, "key_exchanges", keyExchangeRows);
  log(`key_exchanges: +${keyExchangeRows.length}`);

  // 9. citations
  const citationRows = model.citations
    .map((c) => ({ citing_case_id: caseIdBySlug.get(c.citing_case_slug), cited_case_id: caseIdBySlug.get(c.cited_case_slug), treatment: c.treatment, context: c.context }))
    .filter((r) => r.citing_case_id && r.cited_case_id);
  await insertAll(creds, "citations", citationRows);
  log(`citations: +${citationRows.length}`);

  // 10. statute_citations
  const statuteCitationRows = model.statuteCitations
    .map((s) => ({ citing_case_id: caseIdBySlug.get(s.citing_case_slug), statute_id: statuteIdBySlug.get(s.statute_slug), context: s.context }))
    .filter((r) => r.citing_case_id && r.statute_id);
  await insertAll(creds, "statute_citations", statuteCitationRows);
  log(`statute_citations: +${statuteCitationRows.length}`);

  // 11. legal_terms
  const legalTermRows = [...model.legalTerms.values()].map((t) => ({ slug: t.slug, term: t.term, definition: t.definition }));
  const termIdBySlug = await upsertAll(creds, "legal_terms", legalTermRows, "slug", "slug");
  log(`legal_terms: +${legalTermRows.length}`);

  // 12. case_terms
  const caseTermRows = model.caseTerms
    .map((ct) => ({ case_id: caseIdBySlug.get(ct.case_slug), term_id: termIdBySlug.get(ct.term_slug) }))
    .filter((r) => r.case_id && r.term_id);
  await insertAll(creds, "case_terms", caseTermRows);
  log(`case_terms: +${caseTermRows.length}`);

  // 13. publications
  const publicationRows = [...model.publications.values()].map((p) => ({
    url: p.url, kind: p.kind, title: p.title, author_text: p.author_text, published_at: p.published_at, summary: p.summary,
  }));
  const pubIdByUrl = await upsertAll(creds, "publications", publicationRows, "url", "url");
  log(`publications: +${publicationRows.length}`);

  // 14. publication_cases
  const publicationCaseRows = model.publicationCases
    .map((pc) => ({ publication_id: pubIdByUrl.get(pc.publication_url), case_id: caseIdBySlug.get(pc.case_slug) }))
    .filter((r) => r.publication_id && r.case_id);
  await insertAll(creds, "publication_cases", publicationCaseRows);
  log(`publication_cases: +${publicationCaseRows.length}`);

  // 15. circuit_splits
  const circuitSplitRows = [...model.circuitSplits.values()].map((s) => ({
    slug: s.slug, question: s.question, status: s.status,
    scotus_case_id: s.scotus_case_slug ? caseIdBySlug.get(s.scotus_case_slug) : null,
  }));
  const splitIdBySlug = await upsertAll(creds, "circuit_splits", circuitSplitRows, "slug", "slug");
  log(`circuit_splits: +${circuitSplitRows.length}`);

  // 16. split_positions
  const splitPositionRows = model.splitPositions
    .map((sp) => ({ split_id: splitIdBySlug.get(sp.split_slug), case_id: caseIdBySlug.get(sp.case_slug), position: sp.position }))
    .filter((r) => r.split_id && r.case_id);
  await insertAll(creds, "split_positions", splitPositionRows);
  log(`split_positions: +${splitPositionRows.length}`);

  // 17. appellate_impacts
  const appellateImpactRows = model.appellateImpacts
    .map((ai) => ({ case_id: caseIdBySlug.get(ai.case_slug), impact_area: ai.impact_area, direction: ai.direction, writeup: ai.writeup }))
    .filter((r) => r.case_id);
  await insertAll(creds, "appellate_impacts", appellateImpactRows);
  log(`appellate_impacts: +${appellateImpactRows.length}`);
}

// ---------------------------------------------------------------------------
// Report printer
// ---------------------------------------------------------------------------

function printReport(model: Model, report: Report, authorRegistry: HistoricAuthorRegistry) {
  console.log("\n=================== BACKFILL DRY RUN REPORT ===================\n");

  console.log("-- Row counts (what WOULD be written) --");
  const table = {
    people: model.people.size,
    cases: model.cases.size,
    opinions: model.opinions.length,
    votes: model.votes.length,
    opinion_joins: model.opinionJoins.length,
    case_participations: model.caseParticipations.length,
    key_exchanges: model.keyExchanges.length,
    citations: model.citations.length,
    legal_terms: model.legalTerms.size,
    case_terms: model.caseTerms.length,
    publications: model.publications.size,
    publication_cases: model.publicationCases.length,
    publication_people: 0,
    circuit_splits: model.circuitSplits.size,
    split_positions: model.splitPositions.length,
    appellate_impacts: model.appellateImpacts.length,
    statutes: model.statutes.size,
    statute_citations: model.statuteCitations.length,
  };
  for (const [t, n] of Object.entries(table)) console.log(`  ${t.padEnd(22)} ${n}`);

  console.log("\n-- Detailed breakdown (from the bump() calls during build) --");
  for (const [k, n] of Object.entries(report.counts).sort()) console.log(`  ${k.padEnd(40)} ${n}`);

  console.log(`\n-- Historic opinion-author name groups (${authorRegistry.allGroups().length} distinct people, from precedent files) --`);
  for (const g of authorRegistry.allGroups().sort((a, b) => b.rawVariants.size - a.rawVariants.size)) {
    if (g.rawVariants.size > 1) {
      console.log(`  "${g.canonicalName}" (slug: ${g.slug}) <- merged from: ${[...g.rawVariants].join(" | ")}`);
    }
  }
  const singletons = authorRegistry.allGroups().filter((g) => g.rawVariants.size === 1).length;
  console.log(`  (+ ${singletons} names that appeared in only one form, not shown)`);

  console.log(`\n-- Dangling references (${report.dangling.length}) --`);
  if (report.dangling.length === 0) console.log("  none");
  else report.dangling.forEach((d) => console.log(`  - ${d}`));

  console.log(`\n-- Flags / records that don't map cleanly (${report.flags.length}) --`);
  report.flags.forEach((f) => console.log(`  - ${f}`));

  console.log("\n-- SCHEMA GAPS / DESIGN DECISIONS (summary — see inline flags above for specifics) --");
  console.log(`
  1. cases has no "citation" column — every precedent's/circuit-opinion's
     citation string (e.g. "410 U.S. 113") is dropped. This affects ~390
     precedent cases and every circuit-opinion stub. Biggest single gap.
  2. circuit_splits has no "area"/"description" columns — dropped for all
     splits (24).
  3. legal_terms has no "examples"/"related_terms" columns — dropped where
     present (see count above).
  4. RESOLVED for cases with join data: votes now includes every justice
     named as author OR joiner (majorityJoinedBy / concurringSummaries[].
     joinedBy / dissentSummaries[].joinedBy — see the
     fetch-opinion-authors.ts join-extraction commit). Still incomplete for
     the 13 of 55 decided cases that don't have join data yet (12
     legitimately have none to attach — either zero joiners or no matching
     summary; 1, 24-872-hamm-v-smith, has no majorityAuthor at all — a
     pre-existing, separate gap) and for concurrence/dissent authors in
     the flat concurrenceAuthors/dissentAuthors arrays with no matching
     summary entry (joinedBy is only ever captured on *Summaries entries).
  5. RESOLVED for cases with join data: opinion_joins is now populated
     from majorityJoinedBy and per-summary joinedBy (deduped against
     votes' (case,person) primary key — see the dedup pass above). Same
     caveats as #4. Precedents' dissentingOpinions[].joinedBy (a separate,
     already-structured source) is still not wired in — flagged
     per-precedent above, not yet implemented.
  6. Concurrence/dissent authors without a matching per-author summary are
     each modeled as their OWN separate opinion row rather than guessed
     into a single author + opinion_joins split — may overcount distinct
     opinions where several justices actually joined one opinion.
  7. case_participations is sourced from data/lawyers.json, not
     data/cases/*.json (see inline flag above) — needs your explicit
     sign-off since it wasn't in the original Phase 2 source list.
  8. key_exchanges.advocate_id is always null — no per-exchange advocate
     identity exists in the source data.
  9. publications.source_org_id is left null for all articles —
     organizations/affiliations weren't part of the Phase 2 mapping list,
     so no publisher org rows were created without being asked.
  10. publication_people is left EMPTY — data/articles.json has no
      structured "who this article is about" field, only relatedCaseSlugs.
      Using the byline author would misrepresent the relationship.
  11. data/calendar.json: DECIDED — stays out of the database entirely,
      remains JSON-only. 0 rows written, by design, not a gap.
  12. data/justices.json / data/lawyers.json AGGREGATE STATS (totalWords,
      estimatedMinutes, questions, wins/losses): DECIDED — dedicated stats
      table(s), computed by a script, matching current behavior. NOT YET
      IMPLEMENTED — needs its own migration + script, out of scope for
      this backfill (which only targets the Phase 1 + statutes schema).
      Underlying fact of lawyers.json (who argued which case, on which
      side) IS used for case_participations (see #7) — a narrower,
      different use than the stats themselves.
  13. cases (from data/precedents) with court_slug resolved via the "court"
      field: all 9 files that have one now resolve to their real court
      (8 verified courts + ybarra-v-spangard's California Court of Appeal,
      once 'state_appellate' was added to the schema). The 3 precedents
      whose citations couldn't be verified against a real case at all
      (united-states-v-plesinger, pneumo-abatement-technology-inc-v-rj-lee-group-inc,
      united-states-v-all-property-and-assets-held-at-bank-julius-baer-international-ltd)
      were removed from data/precedents/ entirely (content-integrity fix,
      separate commit) rather than backfilled with unverified data — this
      script no longer sees them at all. Two cases
      (24-889-hikma-pharmaceuticals-usa-inc-v-amarin-pharma-inc,
      25-5146-ahmad-abouammo-v-united-states) still cite them by slug in
      citedPrecedents; those references now hit the dangling-citation path
      below and get minimal stub case rows instead — that's expected, not
      a new problem.
  14. statutes/statute_citations and the 'state_appellate' court level
      depend on migration 20260828120800_statutes.sql, which has NOT been
      applied to the remote project yet — this dry run assumes it will be
      before --apply is ever used.
`);

  console.log("=================== END REPORT ===================\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const creds = getCredentials();
  if (!creds) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}\n`);

  // Existing Phase 1 state — needed to resolve FKs correctly either way.
  const existingCourts = await select<{ id: string; slug: string }>(creds, "courts", "?select=id,slug");
  const existingPeople = await select<{ id: string; slug: string }>(creds, "people", "?select=id,slug");
  console.log(`Existing in DB: ${existingCourts.length} courts, ${existingPeople.length} people (from Phase 1).`);
  const courtSlugs = new Set(existingCourts.map((c) => c.slug));
  for (const slug of Object.values(CIRCUIT_KEY_TO_COURT_SLUG).concat("scotus")) {
    if (!courtSlugs.has(slug)) throw new Error(`Expected court slug "${slug}" not found in DB — is Phase 1 fully applied?`);
  }
  const courtIdBySlug = new Map(existingCourts.map((c) => [c.slug, c.id]));
  const personIdBySlug = new Map(existingPeople.map((p) => [p.slug, p.id]));

  const cases = readJsonDir<CaseSummary>("cases");
  const precedents = readJsonDir<PrecedentCase>("precedents");
  const terms = readJsonDir<LegalTerm>("terms");
  const articles = readJsonFile<ArticlesData>("articles.json");
  const circuitSplits = readJsonFile<CircuitSplitsData>("circuit-splits.json");

  const caseSlugs = new Set(cases.map((c) => c.slug));
  const model = newModel();
  const report = newReport();
  const authorRegistry = new HistoricAuthorRegistry();

  buildFromCases(model, report, cases, authorRegistry);
  buildFromPrecedents(model, report, precedents, authorRegistry);
  buildFromTerms(model, report, terms);
  buildFromArticles(model, report, articles, new Set(model.cases.keys()));
  buildFromCircuitSplits(model, report, circuitSplits, new Set(model.cases.keys()));
  buildFromAppellateImpacts(model, report, "appellate-impacts.json");
  buildFromLawyers(model, report, cases);

  // Re-route citations that actually target a statute (routed to
  // model.statutes by buildFromPrecedents, not model.cases) into
  // statute_citations instead. Must run before the dangling-case check
  // below, since a statute target is neither a case nor dangling.
  const remainingCitations: CitationRow[] = [];
  for (const cit of model.citations) {
    if (model.statutes.has(cit.cited_case_slug)) {
      model.statuteCitations.push({
        citing_case_slug: cit.citing_case_slug,
        statute_slug: cit.cited_case_slug,
        context: cit.context,
      });
      bump(report, "statute_citations");
    } else {
      remainingCitations.push(cit);
    }
  }
  model.citations = remainingCitations;

  // votes.primary key is (case_id, person_id) — NOT including side, since a
  // justice can only vote one way per case. Dedup here rather than let a
  // conflict surface as an insert failure at --apply time.
  //
  // Real conflicts do occur: a justice can join the majority "as to Parts
  // I-III" but dissent "as to Part IV" — joinersAfter's documented
  // limitation (it doesn't distinguish full joins from partial ones) means
  // that justice shows up in both majorityJoinedBy AND as a dissent author.
  // When both are present, "dissent" wins: filing or joining a dissent is a
  // specific, individually-confirmed match ("X, J., filed a dissenting
  // opinion"), while majorityJoinedBy comes from a generic swept-up "in
  // which ... joined" clause — the more failure-prone signal of the two.
  const SIDE_PRIORITY: Record<string, number> = { dissent: 2, majority: 1 };
  const seenVotes = new Map<string, VoteRow>();
  for (const v of model.votes) {
    const key = `${v.case_slug}::${v.person_slug}`;
    const existing = seenVotes.get(key);
    if (!existing) {
      seenVotes.set(key, v);
    } else if (existing.side !== v.side) {
      const winner = SIDE_PRIORITY[v.side] > SIDE_PRIORITY[existing.side] ? v : existing;
      const loserSide = winner === v ? existing.side : v.side;
      seenVotes.set(key, winner);
      report.flags.push(`Case ${v.case_slug}: person ${v.person_slug} was assigned conflicting vote sides ("majority" vs "dissent") during parsing — likely a partial join/partial dissent joinersAfter can't distinguish. Kept "${winner.side}", dropped "${loserSide}".`);
    }
  }
  model.votes = [...seenVotes.values()];

  // opinion_joins.primary key is (opinion_id, person_id) — dedup on the
  // full natural-key tuple that stands in for opinion_id pre-insert. Also
  // drop any join row now contradicted by the vote-side resolution above
  // (e.g. a majority-join for someone whose vote was resolved to dissent)
  // — otherwise the DB would assert both "joined the majority" and "voted
  // dissent" for the same person/case.
  const JOIN_KIND_TO_SIDE: Record<string, string> = { majority: "majority", concurrence: "majority", dissent: "dissent" };
  const seenJoins = new Set<string>();
  model.opinionJoins = model.opinionJoins.filter((j) => {
    const key = `${j.case_slug}::${j.opinion_kind}::${j.opinion_author_slug}::${j.joiner_person_slug}`;
    if (seenJoins.has(key)) return false;
    seenJoins.add(key);
    const resolvedVote = seenVotes.get(`${j.case_slug}::${j.joiner_person_slug}`);
    if (resolvedVote && resolvedVote.side !== JOIN_KIND_TO_SIDE[j.opinion_kind]) {
      report.flags.push(`Case ${j.case_slug}: dropped opinion_joins row (${j.joiner_person_slug} joining ${j.opinion_author_slug}'s ${j.opinion_kind}) — contradicted by their resolved vote side ("${resolvedVote.side}").`);
      return false;
    }
    return true;
  });

  // Cross-check every remaining citation's cited_case_slug now that
  // precedents are loaded.
  const allCaseSlugsIncludingPrecedents = new Set(model.cases.keys());
  for (const cit of model.citations) {
    if (!allCaseSlugsIncludingPrecedents.has(cit.cited_case_slug)) {
      report.dangling.push(`citation from "${cit.citing_case_slug}" -> "${cit.cited_case_slug}": no matching case or precedent file. Would create a minimal stub row (caption = the cited case name only) rather than drop the edge.`);
      // Create the stub so the FK will actually resolve at write time.
      model.cases.set(cit.cited_case_slug, {
        slug: cit.cited_case_slug,
        court_slug: "scotus",
        docket_number: null,
        caption: cit.cited_case_slug,
        term: null,
        status: "stub",
        question_presented: null,
        background: null,
        significance: null,
        argued_date: null,
        decided_date: null,
        vote_line: null,
        source_urls: [],
        is_stub: true,
      });
    }
  }

  // data/calendar.json, data/justices.json, data/lawyers.json's stats fields:
  // explicitly not mapped. Noted in the printed report's schema-gaps section.
  // data/us-states-10m.json: static basemap, correctly out of scope — not read at all.

  printReport(model, report, authorRegistry);

  if (!APPLY) {
    console.log("Dry run complete. No writes performed. Re-run with --apply to write.");
    return;
  }

  console.log("\nApplying to remote database...\n");
  await applyModel(creds, model, courtIdBySlug, personIdBySlug);
  console.log("\n✓ Apply complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
