#!/usr/bin/env tsx
/**
 * backfill-ot25-missing-cases.ts
 *
 * One-time backfill (Session 5, Phase 3): Clark v. Sweeney (status
 * correction + full opinions/decisions/decision_ties, replacing the
 * fabricated dissent in data/precedents/clark-v-sweeney.json with the
 * verified 9-0 unanimous per curiam result) plus the 10 OT25 cases
 * confirmed structurally invisible to both normal discovery paths
 * (argument calendar, slip-opinions feed). Every fact below is sourced —
 * see the Checkpoint 3 proposal in this session's transcript for
 * citations per case.
 *
 * Not meant to be re-run or reused as pipeline code — this is backfill,
 * not a new sync path. Run once: npx tsx scripts/backfill-ot25-missing-cases.ts
 */

import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, upsert, insert } from "./lib/supabase-sync/client.js";

const PERSON: Record<string, string> = {
  roberts: "5efc28ce-8c1f-4597-9329-fcc5592e5abc",
  thomas: "a1a35a0f-369f-4dc2-b3e7-5ea601514dc1",
  alito: "4c93adf7-a381-4b49-bc36-0a783f424a53",
  sotomayor: "e8a7926d-aecd-43b5-818f-167ea972bf95",
  kagan: "f2ed161d-4d80-418c-9610-e3f436f7db4b",
  gorsuch: "3a88195f-48fb-46c1-bd49-64575608a049",
  kavanaugh: "2b2276d5-ff1b-4926-90b6-828caed0482c",
  barrett: "2026e320-01a8-41a1-8d1d-7be61ea0969e",
  jackson: "650522b0-a87a-4889-8977-d25745b9c91b",
};
const ALL_JUSTICES = Object.keys(PERSON);

const COURT: Record<string, string> = {
  scotus: "030e0acd-4e2d-4f6b-942b-52def2fad170",
  "second-circuit": "24ef670c-36d7-458d-a8cc-3ccc3bc187ed",
  "fourth-circuit": "12fb2925-d524-4a2d-9e8d-7154e79ae7cf",
  "sixth-circuit": "45d4595a-7468-48a9-8f46-d0fac00a35fd",
  "eleventh-circuit": "075295a5-636b-480d-a9e9-4a8edc162631",
  "mississippi-supreme-court": "14ae2857-48c5-4418-a375-1dd28486df48",
  "district-of-columbia-court-of-appeals": "ae153806-49ac-4339-a661-2346cfb25937",
  "louisiana-court-of-appeal": "d9efc9c2-bad4-4254-9119-df68a27944bd",
  "southern-district-of-new-york": "87a6e770-b9fb-4a7a-a788-339e5ff22fda",
};

interface OpinionSpec { kind: string; authorSlug: string | null; summary: string }
interface TieSpec { opinionIndex: number; personSlug: string; role: "author" | "joiner"; joinScope: "full" | "partial"; joinScopeDetail?: string }
interface DecisionSpec { personSlug: string; position: string; tieOpinionIndex: number | null }
interface CaseSpec {
  slug: string;
  isUpdate: boolean;
  docket_number: string;
  caption: string;
  question_presented: string;
  background: string;
  significance: string;
  argued_date: string | null;
  decided_date: string;
  vote_line: string;
  disposition: string;
  sitting: string;
  source_urls: string[];
  lowerCourts: { courtSlug: string; docket: string }[];
  opinions: OpinionSpec[];
  ties: TieSpec[];
  decisions: DecisionSpec[];
}

/** Every justice not given an explicit position becomes a "silent
 *  majority" decisions row (position=majority, no tie) — same
 *  convention decisionSides.ts/decisions.ts use for the 55 already-
 *  correct cases. */
function withSilentMajority(named: DecisionSpec[]): DecisionSpec[] {
  const namedSlugs = new Set(named.map((d) => d.personSlug));
  const silent = ALL_JUSTICES.filter((s) => !namedSlugs.has(s)).map((personSlug) => ({
    personSlug, position: "majority", tieOpinionIndex: null,
  }));
  return [...named, ...silent];
}

const CASES: CaseSpec[] = [
  {
    slug: "clark-v-sweeney",
    isUpdate: true,
    docket_number: "25-52",
    caption: "Clark v. Sweeney",
    question_presented: "Whether a federal court of appeals may grant habeas corpus relief based on a legal argument that the habeas petitioner never actually raised or presented to the court.",
    background: "Clark v. Sweeney arose from a Maryland state criminal conviction. After state and federal habeas relief were denied, the Fourth Circuit reversed and ordered a new trial, relying on a claim Sweeney had never raised. The Supreme Court summarily reversed, holding the Court of Appeals had departed from the party-presentation principle.",
    significance: "Reaffirms that federal courts of appeals may not grant relief on grounds the parties themselves never presented — cited by later cases (e.g. Margolin v. NAIJ, Hamm v. Smith) invoking the same party-presentation principle.",
    argued_date: null,
    decided_date: "2025-11-24",
    vote_line: "9-0",
    disposition: "reversed_and_remanded",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/clark-v-sweeney/"],
    lowerCourts: [{ courtSlug: "fourth-circuit", docket: "25-52" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal: the Fourth Circuit's grant of habeas relief was based on an argument the petitioner never raised, violating the party-presentation principle." },
    ],
    ties: [],
    decisions: withSilentMajority([]),
  },
  {
    slug: "25-248-district-of-columbia-v-rw",
    isUpdate: false,
    docket_number: "25-248",
    caption: "District of Columbia v. R.W.",
    question_presented: "Whether a court assessing reasonable suspicion under the Fourth Amendment may exclude a fact known to the officer, or must assess the totality of the circumstances.",
    background: "The District of Columbia Court of Appeals held that an officer lacked reasonable suspicion to stop R.W. The Supreme Court summarily reversed, holding the lower court erred by disregarding facts (a dispatch report and the passengers' flight) from its totality-of-the-circumstances analysis.",
    significance: "Reinforces that lower courts must weigh the full totality of circumstances, not exclude individual facts, when assessing reasonable suspicion.",
    argued_date: null,
    decided_date: "2026-04-20",
    vote_line: "7-2",
    disposition: "reversed_and_remanded",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/district-of-columbia-v-r-w/"],
    lowerCourts: [{ courtSlug: "district-of-columbia-court-of-appeals", docket: "25-248" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal, holding the D.C. Court of Appeals erred by disregarding key facts from its totality-of-the-circumstances analysis." },
      { kind: "dissent", authorSlug: "sotomayor", summary: "Justice Sotomayor dissented, indicating she would have denied the petition rather than summarily reversing." },
      { kind: "dissent", authorSlug: "jackson", summary: "Justice Jackson dissented separately, arguing that correcting the Court of Appeals' analysis did not merit summary reversal without merits briefing or oral argument." },
    ],
    ties: [
      { opinionIndex: 1, personSlug: "sotomayor", role: "author", joinScope: "full" },
      { opinionIndex: 2, personSlug: "jackson", role: "author", joinScope: "full" },
    ],
    decisions: withSilentMajority([
      { personSlug: "sotomayor", position: "dissent", tieOpinionIndex: 1 },
      { personSlug: "jackson", position: "dissent", tieOpinionIndex: 2 },
    ]),
  },
  {
    slug: "25-180-doe-v-dynamic-physical-therapy-llc",
    isUpdate: false,
    docket_number: "25-180",
    caption: "Doe v. Dynamic Physical Therapy, LLC",
    question_presented: "Whether a state may immunize private parties from federal civil liability by statute.",
    background: "Louisiana's public-health-emergency statute immunized healthcare providers from civil liability; the Louisiana Court of Appeal held it barred plaintiff's federal claims. The Supreme Court summarily reversed and remanded.",
    significance: "Holds that while states define the scope of liability under state law, a state has no power to confer immunity from federal causes of action.",
    argued_date: null,
    decided_date: "2025-12-08",
    vote_line: "9-0",
    disposition: "reversed_and_remanded",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/doe-v-dynamic-physical-therapy-llc/"],
    lowerCourts: [{ courtSlug: "louisiana-court-of-appeal", docket: "25-180" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal, holding a state cannot confer immunity from federal causes of action." },
    ],
    ties: [],
    decisions: withSilentMajority([]),
  },
  {
    slug: "24-783-enbridge-energy-lp-v-nessel",
    isUpdate: false,
    docket_number: "24-783",
    caption: "Enbridge Energy, LP v. Nessel",
    question_presented: "Whether the 30-day deadline for removing a lawsuit to federal court under 28 U.S.C. §1446(b)(1) can be equitably tolled.",
    background: "Michigan's Attorney General sued Enbridge over Line 5, a pipeline crossing the Straits of Mackinac. Enbridge removed the case to federal court 887 days after being served, well past the 30-day statutory deadline. The Sixth Circuit's judgment was affirmed.",
    significance: "Holds the 30-day removal deadline in 28 U.S.C. §1446(b)(1) is not subject to equitable tolling — a full, argued merits decision, unlike the per curiam dispositions among the other backfilled cases.",
    argued_date: "2026-02-24",
    decided_date: "2026-04-22",
    vote_line: "9-0",
    disposition: "affirmed",
    sitting: "february",
    source_urls: ["https://www.scotusblog.com/cases/enbridge-energy-lp-v-nessel/"],
    lowerCourts: [{ courtSlug: "sixth-circuit", docket: "24-783" }],
    opinions: [
      { kind: "majority", authorSlug: "sotomayor", summary: "Justice Sotomayor, writing for a unanimous Court, held that the 30-day removal deadline under 28 U.S.C. §1446(b)(1) cannot be equitably tolled." },
    ],
    ties: [
      { opinionIndex: 0, personSlug: "sotomayor", role: "author", joinScope: "full" },
    ],
    decisions: withSilentMajority([
      { personSlug: "sotomayor", position: "majority", tieOpinionIndex: 0 },
    ]),
  },
  {
    slug: "25-767-margolin-v-national-association-of-immigration-judges",
    isUpdate: false,
    docket_number: "25-767",
    caption: "Margolin v. National Association of Immigration Judges",
    question_presented: "Whether a court of appeals may vacate and remand based on an issue the parties did not raise, and whether such a challenge must proceed through the Civil Service Reform Act's administrative review scheme.",
    background: "After EOIR adopted a policy regulating immigration judges' work-related speech, NAIJ challenged it; the district court held the challenge had to proceed through the CSRA's administrative scheme. The Fourth Circuit vacated and remanded based on an issue the parties had not raised. The Supreme Court summarily reversed and denied NAIJ's cross-petition.",
    significance: "Another party-presentation-principle summary reversal, decided the same term as Clark v. Sweeney and citing the identical rule.",
    argued_date: null,
    decided_date: "2026-05-26",
    vote_line: "9-0",
    disposition: "reversed_and_remanded",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/margolin-v-national-association-of-immigration-judges-2/"],
    lowerCourts: [{ courtSlug: "fourth-circuit", docket: "25-767" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal: the Fourth Circuit vacated and remanded based on an issue the parties had not raised, violating the party-presentation principle." },
      { kind: "concurrence", authorSlug: "thomas", summary: "Justice Thomas filed a concurring opinion, joined by Justice Barrett." },
    ],
    ties: [
      { opinionIndex: 1, personSlug: "thomas", role: "author", joinScope: "full" },
      { opinionIndex: 1, personSlug: "barrett", role: "joiner", joinScope: "full" },
    ],
    decisions: withSilentMajority([
      { personSlug: "thomas", position: "concurrence", tieOpinionIndex: 1 },
      { personSlug: "barrett", position: "concurrence", tieOpinionIndex: 1 },
    ]),
  },
  {
    slug: "25-748-mccarthy-v-hernandez",
    isUpdate: false,
    docket_number: "25-748",
    caption: "McCarthy v. Hernandez",
    question_presented: "Whether the Second Circuit exceeded its authority under 28 U.S.C. §2254(d)(1) in granting habeas relief absent clearly established federal law requiring the jury instruction at issue.",
    background: "New York charged Hernandez with murder; a second trial (after a hung jury) led to conviction. The Second Circuit granted habeas relief under AEDPA, holding clearly established federal law (from Missouri v. Seibert) required a specific jury instruction. The Supreme Court summarily reversed, holding no such clearly established law existed.",
    significance: "Reinforces AEDPA's strict limits on federal habeas relief for state-court convictions.",
    argued_date: null,
    decided_date: "2026-06-22",
    vote_line: "6-3",
    disposition: "reversed_and_remanded",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/mccarthy-v-hernandez/"],
    lowerCourts: [{ courtSlug: "second-circuit", docket: "25-748" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal, holding no clearly established federal law required the jury instruction the Second Circuit relied on to grant habeas relief." },
      {
        kind: "dissent", authorSlug: null,
        summary: "Justices Sotomayor, Kagan, and Jackson indicated they would have denied the petition for certiorari rather than summarily reversing — a dissent from the grant of certiorari, not from the per curiam opinion's merits reasoning. Sources do not identify a single author among the three.",
      },
    ],
    ties: [
      { opinionIndex: 1, personSlug: "sotomayor", role: "joiner", joinScope: "full" },
      { opinionIndex: 1, personSlug: "kagan", role: "joiner", joinScope: "full" },
      { opinionIndex: 1, personSlug: "jackson", role: "joiner", joinScope: "full" },
    ],
    decisions: withSilentMajority([
      { personSlug: "sotomayor", position: "dissent", tieOpinionIndex: 1 },
      { personSlug: "kagan", position: "dissent", tieOpinionIndex: 1 },
      { personSlug: "jackson", position: "dissent", tieOpinionIndex: 1 },
    ]),
  },
  {
    slug: "25-1083-mullin-v-doe",
    isUpdate: false,
    docket_number: "25-1083 (consolidated with 25-1084)",
    caption: "Mullin v. Doe",
    question_presented: "Whether Congress statutorily barred judicial review of non-constitutional claims related to the Secretary of Homeland Security's termination of a country's Temporary Protected Status designation.",
    background: "The Secretary of Homeland Security terminated Temporary Protected Status for Haiti and Syria. District courts in the Southern District of New York stayed the terminations. The Supreme Court reversed and remanded, holding judicial review of non-constitutional TPS-termination claims is statutorily barred.",
    significance: "Allows DHS to proceed with terminating TPS designations for Haiti and Syria; a fully argued merits case, unlike the per curiam dispositions among the other backfilled cases.",
    argued_date: "2026-04-29",
    decided_date: "2026-06-25",
    vote_line: "6-3",
    disposition: "reversed_and_remanded",
    sitting: "april",
    source_urls: ["https://www.scotusblog.com/cases/noem-v-doe-3/"],
    lowerCourts: [
      { courtSlug: "southern-district-of-new-york", docket: "25-1083" },
      { courtSlug: "southern-district-of-new-york", docket: "25-1084" },
    ],
    opinions: [
      { kind: "majority", authorSlug: "alito", summary: "Justice Alito, writing for the Court, held that Congress statutorily barred judicial review of non-constitutional claims related to the Secretary's termination of TPS designations." },
      { kind: "concurrence", authorSlug: "thomas", summary: "Justice Thomas filed a separate concurring opinion." },
      { kind: "dissent", authorSlug: "kagan", summary: "Justice Kagan dissented, joined by Justices Sotomayor and Jackson." },
    ],
    ties: [
      { opinionIndex: 0, personSlug: "alito", role: "author", joinScope: "full" },
      { opinionIndex: 1, personSlug: "thomas", role: "author", joinScope: "full" },
      { opinionIndex: 2, personSlug: "kagan", role: "author", joinScope: "full" },
      { opinionIndex: 2, personSlug: "sotomayor", role: "joiner", joinScope: "full" },
      { opinionIndex: 2, personSlug: "jackson", role: "joiner", joinScope: "full" },
    ],
    decisions: withSilentMajority([
      { personSlug: "alito", position: "majority", tieOpinionIndex: 0 },
      { personSlug: "thomas", position: "concurrence", tieOpinionIndex: 1 },
      { personSlug: "kagan", position: "dissent", tieOpinionIndex: 2 },
      { personSlug: "sotomayor", position: "dissent", tieOpinionIndex: 2 },
      { personSlug: "jackson", position: "dissent", tieOpinionIndex: 2 },
    ]),
  },
  {
    slug: "24-1159-pitts-v-mississippi",
    isUpdate: false,
    docket_number: "24-1159",
    caption: "Pitts v. Mississippi",
    question_presented: "Whether a state statute permitting a screen obscuring a child witness's view of the defendant may override a defendant's Sixth Amendment right to confront witnesses face to face without case-specific findings of necessity.",
    background: "Jeffrey Pitts was tried on charges arising from his daughter's allegations of sexual abuse; the trial court permitted a screen under Mississippi's child-witness-screening statute. The Mississippi Supreme Court upheld the conviction. The Supreme Court summarily reversed, citing Coy v. Iowa and Maryland v. Craig.",
    significance: "Reaffirms that mandatory child-witness-screening statutes cannot override the Sixth Amendment confrontation right without case-specific findings of necessity.",
    argued_date: null,
    decided_date: "2025-11-24",
    vote_line: "9-0",
    disposition: "reversed",
    sitting: "no_argument",
    source_urls: ["https://www.mondaq.com/unitedstates/trials-appeals-compensation/1712806/pitts-v-mississippi-no-24-1149"],
    lowerCourts: [{ courtSlug: "mississippi-supreme-court", docket: "24-1159" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal, holding the trial court's mandatory witness-screening statute could not override the defendant's Sixth Amendment confrontation right absent case-specific findings of necessity." },
    ],
    ties: [],
    decisions: withSilentMajority([]),
  },
  {
    slug: "25-580-whitton-v-dixon",
    isUpdate: false,
    docket_number: "25-580",
    caption: "Whitton v. Dixon",
    question_presented: "Whether the Eleventh Circuit erred in considering post-trial DNA evidence when assessing whether the Florida Supreme Court reasonably determined a jailhouse informant's testimony was immaterial to the verdict.",
    background: "Gary Whitton was convicted of murder based partly on jailhouse-informant testimony. The Eleventh Circuit vacated based partly on post-trial DNA evidence. The Supreme Court vacated and remanded, holding the Eleventh Circuit erred in considering that evidence.",
    significance: "A case-specific summary vacatur; notable for Justice Alito's partial join to Thomas's dissent.",
    argued_date: null,
    decided_date: "2026-06-01",
    vote_line: "7-2",
    disposition: "vacated_and_remanded",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/whitton-v-dixon/"],
    lowerCourts: [{ courtSlug: "eleventh-circuit", docket: "25-580" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary vacatur, holding the Eleventh Circuit erred in considering post-trial DNA evidence in its materiality analysis." },
      { kind: "dissent", authorSlug: "thomas", summary: "Justice Thomas dissented, joined by Justice Alito except as to Part III-B, arguing the Eleventh Circuit's judgment should not have been vacated." },
    ],
    ties: [
      { opinionIndex: 1, personSlug: "thomas", role: "author", joinScope: "full" },
      { opinionIndex: 1, personSlug: "alito", role: "joiner", joinScope: "partial", joinScopeDetail: "except as to Part III-B" },
    ],
    decisions: withSilentMajority([
      { personSlug: "thomas", position: "dissent", tieOpinionIndex: 1 },
      { personSlug: "alito", position: "dissent", tieOpinionIndex: 1 },
    ]),
  },
  {
    slug: "25-51-klein-v-martin",
    isUpdate: false,
    docket_number: "25-51",
    caption: "Klein v. Martin",
    question_presented: "Whether the Fourth Circuit's award of a new trial exceeded the deference AEDPA requires to state-court determinations that a Brady violation did not warrant a new trial.",
    background: "A Maryland jury convicted Charles Brandon Martin of attempted murder. A state postconviction court held that the State's failure to disclose certain impeachment evidence favorable under Brady v. Maryland did not warrant a new trial, since there was no reasonable probability the trial's result would have differed. The Fourth Circuit affirmed an award of a new trial on reasoning that departed from AEDPA's deferential standard. The Supreme Court summarily reversed.",
    significance: "Reaffirms that federal courts must adhere to strict AEDPA deference to state-court Brady determinations.",
    argued_date: null,
    decided_date: "2026-01-26",
    vote_line: "8-1",
    disposition: "reversed_and_remanded",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/case-files/klein-v-martin/"],
    lowerCourts: [{ courtSlug: "fourth-circuit", docket: "25-51" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal, holding the Fourth Circuit's award of a new trial departed from AEDPA's deferential standard for state-court Brady determinations." },
    ],
    ties: [],
    // Justice Jackson dissented from the cert grant with no written opinion
    // — no opinions/decision_ties row exists to tie her to (nothing was
    // written), but she is NOT part of the silent majority either: she is
    // an explicit, untied dissenter. withSilentMajority() would wrongly
    // default her to "majority" since she has no named tie, so she's
    // listed explicitly here with tieOpinionIndex: null.
    decisions: withSilentMajority([
      { personSlug: "jackson", position: "dissent", tieOpinionIndex: null },
    ]),
  },
  {
    slug: "25-297-zorn-v-linton",
    isUpdate: false,
    docket_number: "25-297",
    caption: "Zorn v. Linton",
    question_presented: "Whether it was clearly established that an officer's use of an armlock and wrist pressure to lift a seated protester violated the Fourth Amendment, such that qualified immunity does not apply.",
    background: "During a Vermont capitol sit-in, Sergeant Jacob Zorn lifted protester Shela Linton using an armlock after she refused to stand. Linton sued for excessive force. The Second Circuit held Zorn was not entitled to qualified immunity. The Supreme Court summarily reversed.",
    significance: "Reinforces the clearly-established-law standard for qualified immunity in excessive-force claims.",
    argued_date: null,
    decided_date: "2026-03-23",
    vote_line: "6-3",
    disposition: "reversed",
    sitting: "no_argument",
    source_urls: ["https://www.scotusblog.com/cases/zorn-v-linton/"],
    lowerCourts: [{ courtSlug: "second-circuit", docket: "25-297" }],
    opinions: [
      { kind: "per_curiam", authorSlug: null, summary: "Per curiam summary reversal, holding it was not clearly established that the officer's conduct violated the Fourth Amendment." },
      { kind: "dissent", authorSlug: "sotomayor", summary: "Justice Sotomayor dissented, joined by Justices Kagan and Jackson, from the Court's summary reversal of the Second Circuit's denial of qualified immunity." },
    ],
    ties: [
      { opinionIndex: 1, personSlug: "sotomayor", role: "author", joinScope: "full" },
      { opinionIndex: 1, personSlug: "kagan", role: "joiner", joinScope: "full" },
      { opinionIndex: 1, personSlug: "jackson", role: "joiner", joinScope: "full" },
    ],
    decisions: withSilentMajority([
      { personSlug: "sotomayor", position: "dissent", tieOpinionIndex: 1 },
      { personSlug: "kagan", position: "dissent", tieOpinionIndex: 1 },
      { personSlug: "jackson", position: "dissent", tieOpinionIndex: 1 },
    ]),
  },
];

async function main() {
  const creds = getCredentials();
  if (!creds) {
    console.error("No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — aborting.");
    process.exit(1);
  }

  // Optional CLI filter (--slug=<slug>) so a case added after the initial
  // run (Klein v. Martin, omitted by mistake from the first pass) can be
  // backfilled on its own without re-inserting opinions/decisions for the
  // cases already written — insert() is not idempotent the way upsert() is.
  const slugFilterArg = process.argv.find((a) => a.startsWith("--slug="));
  const slugFilter = slugFilterArg ? slugFilterArg.slice("--slug=".length) : null;
  const casesToRun = slugFilter ? CASES.filter((c) => c.slug === slugFilter) : CASES;
  if (slugFilter && casesToRun.length === 0) {
    console.error(`No case with slug "${slugFilter}" found.`);
    process.exit(1);
  }

  for (const c of casesToRun) {
    console.log(`\n=== ${c.caption} (${c.slug}) ===`);

    const [caseRow] = await upsert<{ id: string; slug: string }>(creds, "cases", [{
      slug: c.slug,
      court_id: COURT.scotus,
      docket_number: c.docket_number,
      caption: c.caption,
      term: "2025",
      status: "decided",
      question_presented: c.question_presented,
      background: c.background,
      significance: c.significance,
      argued_date: c.argued_date,
      decided_date: c.decided_date,
      vote_line: c.vote_line,
      disposition: c.disposition,
      sitting: c.sitting,
      source_urls: c.source_urls,
      is_stub: false,
    }], "slug");
    const caseId = caseRow.id;
    console.log(`  case ${c.isUpdate ? "updated" : "inserted"}: ${caseId}`);

    const lowerCourtRows = c.lowerCourts.map((lc) => ({
      case_id: caseId, court_id: COURT[lc.courtSlug], docket_number: lc.docket,
    }));
    await upsert(creds, "case_lower_courts", lowerCourtRows, "case_id,court_id,docket_number");
    console.log(`  case_lower_courts: ${lowerCourtRows.length}`);

    const opinionRows = await insert<{ id: string }>(creds, "opinions", c.opinions.map((o) => ({
      case_id: caseId, kind: o.kind, author_id: o.authorSlug ? PERSON[o.authorSlug] : null, summary: o.summary,
    })));
    console.log(`  opinions: ${opinionRows.length}`);

    let tieRows: { id: string }[] = [];
    if (c.ties.length > 0) {
      tieRows = await insert<{ id: string }>(creds, "decision_ties", c.ties.map((t) => ({
        case_id: caseId,
        person_id: PERSON[t.personSlug],
        opinion_id: opinionRows[t.opinionIndex].id,
        role: t.role,
        join_scope: t.joinScope,
        join_scope_detail: t.joinScopeDetail ?? null,
      })));
    }
    console.log(`  decision_ties: ${tieRows.length}`);

    // Map (opinionIndex, personSlug) -> tie id, for wiring primary_tie_id.
    const tieIdByKey = new Map<string, string>();
    c.ties.forEach((t, i) => tieIdByKey.set(`${t.opinionIndex}::${t.personSlug}`, tieRows[i].id));

    const decisionRows = c.decisions.map((d) => ({
      case_id: caseId,
      person_id: PERSON[d.personSlug],
      position: d.position,
      primary_tie_id: d.tieOpinionIndex !== null ? (tieIdByKey.get(`${d.tieOpinionIndex}::${d.personSlug}`) ?? null) : null,
    }));
    await insert(creds, "decisions", decisionRows);
    console.log(`  decisions: ${decisionRows.length}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
