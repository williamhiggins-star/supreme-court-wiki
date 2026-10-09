-- Court actions from order lists (OT2026 on), the approved glossary, and
-- the `granted` case status.
--
-- 1. cases.status gains 'granted': a cert grant creates its cases row
--    before any argument date is set. The site never shows it: its read
--    path (src/lib/db/cases.ts getAllCasesForTerm) only reads petition,
--    upcoming, argued and decided.
-- 2. Anonymous reads of cases exclude 'granted', so those rows can't be
--    fetched through the public API either. Every other status, including
--    stub and historic, stays fully readable as before.
-- 3. court_vocabulary: the approved glossary (Phase 0 gate, 109 codes),
--    Court terminology first; 'derived' marks codes with no formal Court
--    term. court_vocabulary_aliases maps press/legacy labels to codes.
-- 4. court_actions: one row per docket per order-list action, with the
--    Court's verbatim text and the source PDF.
-- 5. summary_reversals_without_argument: the Court-terminology record of
--    each summary disposition. Not added to cases until vote detail can be
--    captured and checked; case_id is set then.
--
-- New tables are written by the pipeline (service role) only; RLS is on
-- with no anon policy.

-- 1 ---------------------------------------------------------------------
alter table public.cases drop constraint cases_status_check;
alter table public.cases add constraint cases_status_check
  check (status in ('petition', 'upcoming', 'argued', 'decided', 'historic', 'stub', 'granted'));

-- 2 ---------------------------------------------------------------------
drop policy "public read access" on public.cases;
create policy "public read access" on public.cases
  for select to anon, authenticated
  using (status <> 'granted');

-- 3 ---------------------------------------------------------------------
create table public.court_vocabulary (
  code         text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  category     text not null,
  court_phrase text not null,
  source       text,
  provenance   text not null check (provenance in ('court_term', 'derived')),
  evidence     text not null check (evidence in ('verified_fixture', 'unverified_recall')),
  notes        text
);
alter table public.court_vocabulary enable row level security;
create policy "public read access" on public.court_vocabulary for select to anon, authenticated using (true);

create table public.court_vocabulary_aliases (
  alias      text primary key,
  code       text references public.court_vocabulary (code),  -- null: deliberately unmapped
  alias_kind text not null check (alias_kind in ('press', 'practitioner', 'repo_legacy')),
  note       text
);
alter table public.court_vocabulary_aliases enable row level security;
create policy "public read access" on public.court_vocabulary_aliases for select to anon, authenticated using (true);
grant select on table public.court_vocabulary, public.court_vocabulary_aliases to anon, authenticated;

-- 4 ---------------------------------------------------------------------
create table public.court_actions (
  id            uuid primary key default gen_random_uuid(),
  docket_number text not null,
  action        text not null references public.court_vocabulary (code),
  action_date   date not null,
  term          text not null,                  -- the orders listing's term, e.g. '2026'
  court_text    text not null,                  -- verbatim from the order
  source_url    text not null,                  -- the order PDF
  source_sha256 text not null,
  case_id       uuid references public.cases (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (docket_number, action, action_date)
);
create index court_actions_case_id_idx on public.court_actions (case_id);
create index court_actions_action_date_idx on public.court_actions (action_date);
alter table public.court_actions enable row level security;

-- 5 ---------------------------------------------------------------------
create table public.summary_reversals_without_argument (
  id              uuid primary key default gen_random_uuid(),
  docket_number   text not null unique,
  term            text not null,
  decided_date    date not null,
  court_action_id uuid not null references public.court_actions (id),
  case_id         uuid references public.cases (id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table public.summary_reversals_without_argument enable row level security;

-- Pipeline-only: no anon/authenticated access at all, even if RLS changed.
revoke all on table public.court_actions, public.summary_reversals_without_argument from anon, authenticated;

-- Seed: the approved glossary ------------------------------------------
insert into public.court_vocabulary (code, category, court_phrase, source, provenance, evidence, notes) values
  ('paid', 'series', '"Paid" lists include cases in which the petitioner pays the filing fee under Rule 38(a); those cases have a docket number from 1 to 5000 following the prefix for the Term (e.g., No. 20-325).', 'Case Distribution Schedule page (filingandrules/casedistribution); Rule 38(a)', 'court_term', 'verified_fixture', 'Replaces petition_paid. Format yy-n, n<5000.'),
  ('ifp', 'series', '"Ifp" lists include cases in which the petitioner has submitted the petition along with a motion for leave to proceed in forma pauperis under Rule 39; those cases have a docket number above 5000 following the prefix for the Term (e.g., No. 20-5754).', 'Case Distribution Schedule page; Rule 39', 'court_term', 'verified_fixture', 'Replaces petition_ifp. Court spelling on that page is ''Ifp''; Clerk memo uses ''ifp'' and ''in forma pauperis''. Format yy-5nnn+.'),
  ('application', 'series', 'Application No. A ___ (sample petition form); docket numbers like 25A354', 'IFP Guide 2026, sample Jurisdiction page; order lists 2025-26 (25A354, 25A489)', 'court_term', 'verified_fixture', 'Format yyAnnn (no hyphen). Rules 22-23 govern. The Court never calls it the ''A series'' or ''emergency docket''.'),
  ('motion', 'series', '25M43 / 25M44 / 25M45 (e.g. ''The motion for leave to proceed as a seaman is denied.'')', 'order lists OT2025 (65 M numbers in 7 lists)', 'derived', 'verified_fixture', 'Series letter is the Court''s; no published Clerk name for the ''M'' series. Seen for motions to direct the Clerk to file out of time, leave to proceed as veteran/seaman, leave to file under seal. Proposed label: motion_docket (derived).'),
  ('original', 'series', '141, ORIG. TEXAS V. NEW MEXICO, ET AL.', 'order list (Special Master report entry); Rule 17 ''Procedure in an Original Action''', 'court_term', 'verified_fixture', 'Court style ''No. 141, Orig.''. Electronic docket file name (e.g. 22O141) is unverified.'),
  ('attorney_discipline', 'series', 'ATTORNEY DISCIPLINE / D-3155 IN THE MATTER OF DISBARMENT OF ...; D-3156 IN THE MATTER OF DISCIPLINE OF ...', 'order lists OT2025', 'court_term', 'verified_fixture', 'D-nnnn, not term-prefixed. Rules 5 & 8. Not in provisional list; add so parsers don''t drop it.'),
  ('petition_for_writ_of_certiorari', 'proceeding_type', 'petition for a writ of certiorari', 'Rules 10-16', 'court_term', 'verified_fixture', null),
  ('certiorari_before_judgment', 'proceeding_type', 'petition for a writ of certiorari before judgment / ''Certiorari to a United States Court of Appeals Before Judgment''', 'Rule 11; order lists (''The petition for a writ of certiorari before judgment is denied.'')', 'court_term', 'verified_fixture', 'A proceeding type, not a docket relation; relation to the CA docket is before_judgment_in (derived).'),
  ('jurisdictional_statement', 'proceeding_type', 'Appeal from a United States District Court ... jurisdictional statement', 'Rule 18', 'court_term', 'verified_fixture', 'Mandatory appeals; stages differ (note probable jurisdiction etc.).'),
  ('petition_for_extraordinary_writ', 'proceeding_type', 'Petition for an Extraordinary Writ (writ of mandamus / prohibition / habeas corpus / common-law certiorari)', 'Rule 20; order-list headings MANDAMUS DENIED, PROHIBITION DENIED, HABEAS CORPUS DENIED', 'court_term', 'verified_fixture', 'Sub-kinds: mandamus, prohibition, habeas_corpus.'),
  ('certified_question', 'proceeding_type', 'Procedure on a Certified Question ... the certificate', 'Rule 19', 'court_term', 'verified_fixture', null),
  ('original_action', 'proceeding_type', 'an action invoking the Court''s original jurisdiction ... motion for leave to file ... initial pleading', 'Rule 17', 'court_term', 'verified_fixture', 'Order lists use ''bill of complaint'' (unverified here).'),
  ('application_to_individual_justice', 'proceeding_type', 'Applications to Individual Justices', 'Rule 22', 'court_term', 'verified_fixture', null),
  ('docketed', 'action/stage', 'The case then will be placed on the docket. / docket header ''Docketed: August 12, 2025''', 'Rule 12.3; docket 25-170 header', 'court_term', 'verified_fixture', 'Docketed date differs from filed date (25-170: filed Aug 8, docketed Aug 12).'),
  ('petition_filed', 'action', 'Petition for a writ of certiorari filed. (Response due September 11, 2025)', 'docket 25-170, Aug 08 2025', 'court_term', 'verified_fixture', 'IFP variant (recall): ''Petition for a writ of certiorari and motion for leave to proceed in forma pauperis filed.'''),
  ('response_waived', 'action', 'Waiver of right of respondent Cty. Comm''rs of Boulder Cty., et al. to respond filed.', 'docket 25-170, Aug 28 2025; Rule 15.5 ''express waiver of the right to file a brief in opposition''', 'court_term', 'verified_fixture', null),
  ('response_requested', 'action/stage', 'Response Requested. (Due October 9, 2025)', 'docket 25-170, Sep 09 2025; Clerk memo (Mar 2026) §5 ''request a response''; Rule 15.1 ''when requested by the Court''', 'court_term', 'verified_fixture', 'Clerk memo also says ''the Court later calls for a response'' — ''called for'' is a Court variant, but docket wording is ''Response Requested.'''),
  ('brief_in_opposition_filed', 'action', 'Brief of respondents County Commissioners of Boulder County, et al. in opposition filed.', 'docket 25-170, Nov 10 2025; Rule 15', 'court_term', 'verified_fixture', 'Replaces response_filed for cert stage. Rule 12.6 also has ''brief in support'' (respondent supporting petitioner).'),
  ('reply_filed', 'action', 'Reply of petitioners Suncor Energy (U.S.A.) Inc., et al. filed. (Distributed)', 'docket 25-170, Nov 25 2025; Rule 15.6 ''reply brief''', 'court_term', 'verified_fixture', 'Identical wording at merits stage (Aug 26 2026) — stage must be inferred from position vs. grant.'),
  ('supplemental_brief_filed', 'action', 'supplemental brief ... calling attention to new cases, new legislation, or other intervening matter', 'Rule 15.8', 'court_term', 'verified_fixture', null),
  ('extension_of_time_to_respond_granted', 'action', 'Motion to extend the time to file a response is granted and the time is extended to and including November 10, 2025.', 'docket 25-170, Sep 25 2025; Rule 30.4', 'court_term', 'verified_fixture', 'Clerk acts under Rule 30.4 (''submitted to The Clerk'').'),
  ('distributed_for_conference', 'action/stage', 'DISTRIBUTED for Conference of 9/29/2025.', 'docket 25-170; Rule 15.5 ''The Clerk will distribute the petition''; Clerk memo §4 ''When a case is distributed for conference, a notation is added to the docket''', 'court_term', 'verified_fixture', 'Store conference date as structured field.'),
  ('rescheduled', 'action', 'Rescheduled.', 'docket entry wording (not in saved fixtures)', 'court_term', 'unverified_recall', 'Verify against docket fixtures. Means the case was taken off the listed conference before consideration.'),
  ('redistributed_for_conference', 'stage', 'cases that were scheduled for a previous conference but not decided, and are ready to be considered again', 'Clerk memo (Mar 2026) p.3 n.1', 'derived', 'verified_fixture', 'Replaces ''relisted''. ''Relist'' is press usage (SCOTUSblog); the Court never uses it. On the docket a relist is just another ''DISTRIBUTED for Conference of …'' entry (25-170 had 6). Compute; do not store as an action.'),
  ('held_inferred', 'stage', '(no Court phrase — the Court does not announce holds)', 'n/a', 'derived', 'verified_fixture', 'Replaces ''held''. Inference only (petition considered at conference, no disposition, not rescheduled, a related merits case pending). Never display as a Court action.'),
  ('held_in_abeyance', 'action', 'The joint motion to hold the petition in abeyance is granted.', 'order list OT2025 (24-999)', 'court_term', 'verified_fixture', 'A party-requested abeyance — distinct from an unannounced Court ''hold''.'),
  ('cvsg', 'action/stage', 'The Solicitor General is invited to file a brief in this case expressing the views of the United States. (Clerk: ''call for the views of the Solicitor General (CVSG)'')', 'order lists OT2025; Clerk memo (Mar 2026) §5 p.4-5', 'court_term', 'verified_fixture', 'The Clerk''s memo itself uses the acronym ''CVSG'', so it counts as a Court term. Plural: ''invited to file briefs in these cases''.'),
  ('cvsg_brief_filed', 'action', 'Brief amicus curiae of United States filed. (Clerk memo: ''Once the Solicitor General''s brief is filed'')', 'docket 25-170 wording; Clerk memo §5', 'derived', 'verified_fixture', 'Docket wording is the same as a voluntary US amicus brief (25-170 had one Sep 11 2025 with no CVSG). Derived: a US amicus brief filed after cvsg.'),
  ('petition_granted', 'action/stage', 'Petition GRANTED. / The petition for a writ of certiorari is granted.', 'docket 25-170 Feb 23 2026; order lists; Rule 16.2', 'court_term', 'verified_fixture', 'Replaces cert_granted. Order-list section: CERTIORARI GRANTED.'),
  ('granted_limited_to_question', 'action', 'The petition for a writ of certiorari is granted limited to Question 1 presented by the petition.', 'order list OT2025', 'court_term', 'verified_fixture', 'Store the question numbers. Variant: ''granted as to the question presented by the petition in No. …''.'),
  ('granted_with_added_question', 'action', 'In addition to the question presented by the petition, the parties are directed to brief and argue the following question: …', 'docket 25-170 Feb 23 2026', 'derived', 'verified_fixture', 'Code name derived; phrase verbatim.'),
  ('ifp_granted_and_petition_granted', 'action', 'The motion of petitioner for leave to proceed in forma pauperis and the petition for a writ of certiorari are granted.', 'order lists OT2025', 'court_term', 'verified_fixture', null),
  ('consolidated', 'action/relation', 'The cases are consolidated, and a total of one hour is allotted for oral argument.', 'order list OT2025', 'court_term', 'verified_fixture', null),
  ('probable_jurisdiction_noted', 'action/stage', 'note probable jurisdiction', 'Rule 18.12; Guide for Counsel p.1; ''Granted/Noted Cases List''', 'court_term', 'verified_fixture', 'Appeals analogue of petition_granted.'),
  ('consideration_of_jurisdiction_postponed', 'action', 'postpone consideration of jurisdiction until a hearing of the case on the merits', 'Rule 18.12', 'court_term', 'verified_fixture', null),
  ('petition_denied', 'action/stage', 'The petition for a writ of certiorari is denied. / Petition DENIED.', 'order lists (CERTIORARI DENIED); Rule 16.3', 'court_term', 'verified_fixture', 'Replaces cert_denied. Docket form ''Petition DENIED.'' is recall-level.'),
  ('granted_vacated_remanded', 'action', 'The petition for a writ of certiorari is granted. The judgment is vacated, and the case is remanded to the [court] for further consideration in light of [case].', 'order lists OT2025 (section CERTIORARI -- SUMMARY DISPOSITIONS)', 'derived', 'verified_fixture', 'Replaces gvr. ''GVR'' is not a Court term; the code joins the Court''s own three verbs. Store the ''in light of'' target as a structured field.'),
  ('summary_disposition', 'action', 'The order may be a summary disposition on the merits. (per curiam: ''The petition for certiorari is granted, the judgment … is reversed, and the case is remanded for further proceedings not inconsistent with this opinion.'')', 'Rule 16.1; Rule 18.12; order-list section ''CERTIORARI -- SUMMARY DISPOSITION(S)''', 'court_term', 'verified_fixture', 'Replaces summary_reversal. Record judgment verb separately (reversed/vacated/affirmed). ''Summary reversal'' is not the Court''s label.'),
  ('dismissed_rule_46', 'action', 'the Clerk, without further reference to the Court, will enter an order of dismissal (docket: ''Petition DISMISSED - Rule 46.'')', 'Rule 46.1-46.2; docket wording not in fixtures', 'court_term', 'unverified_recall', 'Rule text verified; docket wording is recall-level. Verify.'),
  ('dismissed_rule_39_8', 'action', 'The motion of petitioner for leave to proceed in forma pauperis is denied, and the petition for a writ of certiorari is dismissed. See Rule 39.8.', 'order lists OT2025 (30 times)', 'court_term', 'verified_fixture', 'Distinct from a denial. Sometimes paired with the Martin v. D.C. Court of Appeals filing-bar order.'),
  ('dismissed', 'action', '… is dismissed (generic)', 'order lists; Rules 19.3, 46', 'court_term', 'verified_fixture', 'Generic bucket; prefer the specific codes.'),
  ('dismissed_as_improvidently_granted', 'action', 'The writ of certiorari is dismissed as improvidently granted.', 'per curiam opinions (not in saved fixtures)', 'court_term', 'unverified_recall', 'Replaces dig. ''DIG'' is practitioner shorthand.'),
  ('rehearing_denied', 'action', 'The petition for rehearing is denied. (section heading REHEARINGS DENIED)', 'order lists OT2025; Rule 44', 'court_term', 'verified_fixture', null),
  ('motion_out_of_time_denied', 'action', 'The motion to direct the Clerk to file a petition for a writ of certiorari out of time is denied.', 'order lists OT2025 (M numbers)', 'court_term', 'verified_fixture', null),
  ('filing_bar_imposed', 'action', 'As the petitioner has repeatedly abused this Court''s process, the Clerk is directed not to accept any further petitions in noncriminal matters from petitioner unless the docketing fee required by Rule 38(a) is paid …', 'order lists OT2025', 'derived', 'verified_fixture', 'Code name derived; phrase verbatim (Martin v. D.C. Court of Appeals order).'),
  ('set_for_argument', 'action/stage', 'SET FOR ARGUMENT on Monday, October 5, 2026.', 'docket 25-170 Aug 04 2026; Rules 27, 20.6', 'court_term', 'verified_fixture', 'Replaces argument_set.'),
  ('circulated', 'action', 'CIRCULATED', 'docket 25-170 Aug 12 2026', 'court_term', 'verified_fixture', 'The Court does not explain this entry; store it verbatim and give it no meaning.'),
  ('record_requested', 'action', 'Record requested from the Supreme Court of Colorado.', 'docket 25-170; Rules 12.7, 16.2', 'court_term', 'verified_fixture', null),
  ('record_received', 'action', 'Record received electronically from the Supreme Court of Colorado and available with the Clerk.', 'docket 25-170', 'court_term', 'verified_fixture', null),
  ('argued', 'action/stage', 'Argued. For petitioners: …', 'docket 25-170 Oct 05 2026; slip-opinion syllabus ''Argued …—Decided …''', 'court_term', 'verified_fixture', null),
  ('submitted', 'action', 'Submitted.', 'repo classifier comment (scripts/lib/docket-proceedings.ts)', 'court_term', 'unverified_recall', 'For cases decided without argument after briefing. Verify.'),
  ('decided', 'action/stage', 'Decided [date] (slip opinion / per curiam header); docket: ''Judgment REVERSED and case REMANDED.'' etc.', 'order lists (per curiam ''Decided …''); docket wording recall', 'court_term', 'verified_fixture', 'Store the judgment verb (affirmed/reversed/vacated/remanded/dismissed) separately.'),
  ('judgment_issued', 'action', 'JUDGMENT ISSUED. (Rule 45: mandate / certified copy of the judgment)', 'Rule 45.2-45.3; Guide for Counsel p.14 ''The judgment or mandate of the Court will be issued by the Clerk 32 days after''', 'court_term', 'unverified_recall', 'Docket wording is recall-level.'),
  ('not_participating', 'action', 'Letter from Clerk of Court to counsel of record noting that Justice Alito will not continue to participate in this case.', 'docket 25-170 Sep 28 2026', 'derived', 'verified_fixture', 'Code name derived.'),
  ('application_filed', 'action', 'Application (25A___) for a stay, submitted to Justice ___. (Rule 22.1: ''An application addressed to an individual Justice shall be filed with the Clerk'')', 'Rule 22.1; docket wording recall', 'court_term', 'unverified_recall', 'Docket wording needs checking against application docket fixtures.'),
  ('application_response_requested', 'action', 'Response to application (25A___) requested by Justice ___, due by …', 'docket wording (recall)', 'court_term', 'unverified_recall', 'Replaces response_called_for. Same Court verb as the cert stage (''requested'').'),
  ('referred_to_the_court', 'action', 'The application for stay addressed to Justice Jackson and referred to the Court is denied. / presented to Justice Kagan and by her referred to the Court', 'order lists OT2025; misc order 10/6/2025; Rule 22.5 ''may refer it to the Court for determination''', 'court_term', 'verified_fixture', 'Replaces referred_to_court.'),
  ('application_granted', 'action', 'The application for stay … is granted.', 'Rules 22-23; order wording', 'court_term', 'unverified_recall', 'The ''granted'' form is not in the saved fixtures (only denials).'),
  ('application_denied', 'action', 'The application for stay addressed to the Chief Justice and referred to the Court is denied.', 'order lists OT2025; Rule 22.4 ''A Justice denying an application will note the denial thereon''', 'court_term', 'verified_fixture', null),
  ('application_denied_as_moot', 'action', 'The applications for stay are denied as moot.', 'order list OT2025', 'court_term', 'verified_fixture', null),
  ('application_granted_in_part', 'action', 'The application for stay is granted in part …', 'order wording (recall)', 'court_term', 'unverified_recall', null),
  ('extension_of_time_granted', 'action', 'An extension of time to file the petition for a writ of certiorari was granted to and including (date) on (date) in Application No. A ___ (docket: ''Application (25A___) granted by Justice ___ extending the time to file until …'')', 'IFP Guide 2026 sample form; Rules 13.5, 30.2-30.3', 'court_term', 'verified_fixture', 'Form wording verified; docket wording recall-level.'),
  ('application_withdrawn', 'action', '(no Court term confirmed)', 'n/a', 'derived', 'unverified_recall', 'Rules have no withdrawal procedure for applications; check docket fixtures for actual wording.'),
  ('application_treated_as_petition', 'action/relation', 'The application … is treated as a petition for a writ of certiorari [before judgment], and the petition is granted.', 'order wording (recall)', 'court_term', 'unverified_recall', 'Replaces treated_as_cert_petition. Verify.'),
  ('application_deferred', 'action', 'The application … is deferred pending oral argument …', 'order wording (recall; e.g. 25A312 Trump v. Cook)', 'court_term', 'unverified_recall', null),
  ('application_set_for_argument', 'action', 'setting an application or original case for argument', 'Guide for Counsel 2024 p.1', 'court_term', 'verified_fixture', '25A312 was argued as an application.'),
  ('renewed_application', 'action', 'Renewed application is made by a letter to the Clerk, designating the Justice …', 'Rule 22.4', 'court_term', 'verified_fixture', null),
  ('administrative_stay', 'action', '(no Rule term; the wording of Circuit Justice orders varies)', 'n/a', 'derived', 'unverified_recall', 'Press ''administrative stay''. Verify wording against chambers orders before choosing a code.'),
  ('stay', 'application_type', 'application for stay / application for a stay', 'order lists OT2025; Rule 23', 'court_term', 'verified_fixture', null),
  ('partial_stay', 'application_type', 'application for partial stay', 'misc order 10/6/2025 (25A354)', 'court_term', 'verified_fixture', null),
  ('stay_of_execution', 'application_type', 'application for stay of execution of sentence of death', 'misc orders 10/7/2026 (26A456, 26A459)', 'court_term', 'verified_fixture', null),
  ('injunction', 'application_type', 'application for an injunction', 'order list OT2025 (25A571)', 'court_term', 'verified_fixture', null),
  ('bail', 'application_type', 'application for bail', 'order list OT2025 (25A171); Rule 22.5', 'court_term', 'verified_fixture', null),
  ('vacate', 'application_type', 'application to vacate', 'order list OT2025', 'court_term', 'verified_fixture', 'Commonly ''to vacate stay'' / ''to vacate injunction'' — store the object.'),
  ('extension_cert_petition', 'application_type', 'application to extend the time to file a petition for a writ of certiorari', 'Rules 13.5, 30.2-30.3', 'court_term', 'verified_fixture', null),
  ('extension_jurisdictional_statement', 'application_type', 'application to extend the time to file a jurisdictional statement', 'Rules 18.3, 30.3', 'court_term', 'verified_fixture', null),
  ('extension_merits_reply', 'application_type', 'application to extend the time … to file a reply brief on the merits', 'Rule 30.3', 'court_term', 'verified_fixture', null),
  ('extension_rehearing', 'application_type', 'application to extend the time … to file a petition for rehearing of any judgment or decision of the Court on the merits', 'Rule 30.3', 'court_term', 'verified_fixture', null),
  ('recall_and_stay_mandate', 'application_type', 'application to recall and stay the mandate', 'order wording (recall)', 'court_term', 'unverified_recall', null),
  ('consolidated_with', 'relation', 'The cases are consolidated', 'order list OT2025', 'court_term', 'verified_fixture', null),
  ('argued_together', 'relation', 'order that two or more cases involving the same or related questions be argued together as one case', 'Rule 27.3', 'court_term', 'verified_fixture', null),
  ('cross_petition', 'relation', 'conditional cross-petition / cross-petition for a writ of certiorari', 'Rules 12.5, 13.4', 'court_term', 'verified_fixture', null),
  ('directly_related', 'relation', 'proceedings … that are directly related to the case in this Court … a case is "directly related" if it arises from the same trial court case …', 'Rule 14.1(b)(iii)', 'court_term', 'verified_fixture', 'Replaces same_underlying_case.'),
  ('extension_application_for', 'relation', 'in Application No. A ___ (docket header ''Linked with'' — recall)', 'IFP Guide 2026 sample form', 'derived', 'verified_fixture', 'Replaces application_precedes_petition.'),
  ('before_judgment_in', 'relation', 'to review a case pending in a United States court of appeals, before judgment is entered in that court', 'Rule 11', 'derived', 'verified_fixture', 'Replaces cert_before_judgment (as a relation).'),
  ('held_for', 'relation', '(no Court phrase)', 'n/a', 'derived', 'verified_fixture', 'Inference only, with a confidence value.'),
  ('in_light_of', 'relation', 'for further consideration in light of [case]', 'GVR orders, order lists OT2025', 'court_term', 'verified_fixture', 'Points from a GVR''d docket to the controlling decision.'),
  ('treated_as_petition', 'relation', 'is treated as a petition for a writ of certiorari', 'order wording (recall)', 'court_term', 'unverified_recall', null),
  ('would_grant', 'vote_notation', 'Justice Kavanaugh would grant the petition for a writ of certiorari.', 'order lists OT2025', 'court_term', 'verified_fixture', 'Also ''would grant the petition for rehearing'', ''would grant the application for stay of execution''.'),
  ('would_deny', 'vote_notation', 'Justice ___ would deny the application.', 'order wording (recall)', 'court_term', 'unverified_recall', null),
  ('dissenting_from_denial', 'vote_notation', 'JUSTICE ___, with whom JUSTICE ___ joins, dissenting from the denial of certiorari.', 'order lists OT2025', 'court_term', 'verified_fixture', 'One variant has ''from denial of certiorari'' (no ''the'').'),
  ('statement_respecting_denial', 'vote_notation', 'Statement of JUSTICE ___ respecting the denial of certiorari.', 'order lists OT2025', 'court_term', 'verified_fixture', null),
  ('concurring_in_denial', 'vote_notation', 'Justice Sotomayor, concurring: I concur in the denial of certiorari …', 'order list OT2025', 'court_term', 'verified_fixture', null),
  ('dissents', 'vote_notation', 'Justice ___ dissents.', 'order wording (recall)', 'court_term', 'unverified_recall', null),
  ('took_no_part', 'vote_notation', 'Justice Alito took no part in the consideration or decision of this petition.', 'order lists OT2025', 'court_term', 'verified_fixture', 'Also ''… of this motion''.'),
  ('sec_orders_in_pending_cases', 'order_list_section', 'ORDERS IN PENDING CASES', 'order lists OT2025', 'court_term', 'verified_fixture', 'Singular ''ORDER IN PENDING CASE'' appears on miscellaneous orders.'),
  ('sec_certiorari_summary_dispositions', 'order_list_section', 'CERTIORARI -- SUMMARY DISPOSITIONS', 'order lists OT2025', 'court_term', 'verified_fixture', 'Singular variant exists.'),
  ('sec_certiorari_granted', 'order_list_section', 'CERTIORARI GRANTED', 'order lists', 'court_term', 'verified_fixture', null),
  ('sec_certiorari_denied', 'order_list_section', 'CERTIORARI DENIED', 'order lists', 'court_term', 'verified_fixture', null),
  ('sec_habeas_corpus_denied', 'order_list_section', 'HABEAS CORPUS DENIED', 'order lists', 'court_term', 'verified_fixture', null),
  ('sec_mandamus_denied', 'order_list_section', 'MANDAMUS DENIED', 'order lists', 'court_term', 'verified_fixture', null),
  ('sec_prohibition_denied', 'order_list_section', 'PROHIBITION DENIED', 'order lists', 'court_term', 'verified_fixture', null),
  ('sec_rehearings_denied', 'order_list_section', 'REHEARINGS DENIED', 'order lists', 'court_term', 'verified_fixture', null),
  ('sec_attorney_discipline', 'order_list_section', 'ATTORNEY DISCIPLINE', 'order lists', 'court_term', 'verified_fixture', null),
  ('amicus_brief_filed', 'filing', 'Brief amicus curiae of ___ filed. / Brief amici curiae of ___ filed.', 'docket 25-170', 'court_term', 'verified_fixture', null),
  ('merits_brief_filed', 'filing', 'Brief of petitioners ___ filed. / Brief of respondents ___ filed.', 'docket 25-170; Rules 24-25 ''brief on the merits''', 'court_term', 'verified_fixture', null),
  ('joint_appendix_filed', 'filing', 'Joint appendix filed.', 'docket 25-170; Rule 26', 'court_term', 'verified_fixture', null),
  ('not_accepted_for_filing', 'filing', 'Amicus brief of ___ not accepted for filing.', 'docket 25-170', 'court_term', 'verified_fixture', null),
  ('letter_filed', 'filing', 'Letter received from ___ / Letter of ___ filed.', 'docket 25-170', 'court_term', 'verified_fixture', null);

insert into public.court_vocabulary_aliases (alias, code, alias_kind, note) values
  ('GVR', 'granted_vacated_remanded', 'press', null),
  ('DIG', 'dismissed_as_improvidently_granted', 'press', null),
  ('summary reversal', 'summary_disposition', 'press', 'The Court''s label is a summary disposition; the judgment verb (reversed/vacated) is in the text.'),
  ('relist', 'redistributed_for_conference', 'practitioner', null),
  ('cert granted', 'petition_granted', 'press', null),
  ('cert denied', 'petition_denied', 'press', null),
  ('emergency docket', null, 'press', 'Not a Court term. Applications are the application series.'),
  ('shadow docket', null, 'press', 'Not a Court term.'),
  ('upcoming', 'set_for_argument', 'repo_legacy', 'cases.status value until the status rename.'),
  ('petition', 'argued', 'repo_legacy', 'cases.status value meaning argued, until the status rename.');
