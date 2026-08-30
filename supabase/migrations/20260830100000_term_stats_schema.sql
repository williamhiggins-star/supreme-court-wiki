-- Term stats schema — the additive changes needed to compute every
-- statistic in the SCOTUSblog term Stat Pack from this schema. See
-- docs/term-stats-coding-rules.md for the exact derivation rule each
-- addition below exists to support. Schema only: no data is backfilled
-- and no parser/pipeline code writes any of these columns yet.
--
-- Design decisions made here, and why (audited against the schema as of
-- 20260829120000_decisions.sql — see docs/term-stats-coding-rules.md §0):
--
--   1. decisions/decision_ties (not votes) is canonical for case-level
--      vote-side, per that migration's own comment ("Most queries...
--      should read from here"). Nothing here adds to votes.
--   2. opinion_joins is NOT extended with scope/parts columns.
--      decision_ties already has join_scope + join_scope_detail (added
--      20260829120000, unpopulated) and is already many-to-many
--      (unique (person_id, opinion_id), so one person ties to many
--      opinions in the same case). Adding the same capability to
--      opinion_joins too would just be a second, competing place for the
--      same fact — opinion_joins is the table being superseded here, by
--      the same logic the decisions.sql migration applied to votes.
--   3. decisions.position is NOT extended with 'concurrence_in_part' /
--      'dissent_in_part' values. Those are new *document* kinds
--      (opinions.kind, below) — for vote-SIDE purposes a concurrence-in-
--      part is still majority-side and a dissent-in-part is still
--      dissent-side (per the coding-rules cross-check derivation rule),
--      i.e. they belong to the existing 'concurrence' / 'dissent'
--      position buckets, not new ones. Splitting them at the position
--      layer would create two ways to ask "which side was this justice
--      on" that could drift.
--   4. No cert-stage / order-list voting is added (the "would deny/
--      grant" case in the coding rules doc). That is a structurally
--      different thing from a merits opinion — it would need its own
--      orders/cert-votes table, not a column here — and is out of scope
--      for this pass. Documented as an open gap, not addressed.
--   5. Consolidated dockets are modeled as multiple rows in a new
--      case_lower_courts table under ONE cases row, not as multiple
--      cases rows linked by a self-FK. This is what makes "one
--      circuit-scorecard row per distinct lower court" for a
--      consolidated case answerable with a single group-by, and avoids
--      ever having two cases rows both claiming to be the same case.

-- ---------------------------------------------------------------------------
-- opinions — new document kinds + word count
-- ---------------------------------------------------------------------------

-- 'plurality' already existed. Adding 'concurrence_in_part' and
-- 'dissent_in_part' as their own kinds, distinct from the existing
-- 'concur_dissent' (which is a single opinion that is BOTH concurring
-- and dissenting in part). The new two are for an opinion that does only
-- one of those things — e.g. dissents from Part III without a
-- freestanding concurrence in the rest, vs. Roberts writing an opinion
-- that explicitly styles itself as concurring in part and dissenting in
-- part. Whole constraint recreated, per the pattern the previous
-- migration used.
alter table public.opinions drop constraint opinions_kind_check;
alter table public.opinions add constraint opinions_kind_check check (kind in (
  'majority', 'plurality', 'per_curiam',
  'concurrence', 'concurrence_in_judgment', 'concurrence_in_part',
  'concur_dissent', 'dissent_in_part', 'dissent'
));

alter table public.opinions add column word_count int;
alter table public.opinions add constraint opinions_word_count_non_negative
  check (word_count is null or word_count >= 0);

-- ---------------------------------------------------------------------------
-- cases — disposition + sitting
-- ---------------------------------------------------------------------------

-- argued_date / decided_date already exist (original Phase 1 migration)
-- and need no change.

alter table public.cases add column disposition text;
alter table public.cases add constraint cases_disposition_check check (disposition is null or disposition in (
  'affirmed', 'reversed', 'reversed_and_remanded', 'vacated', 'vacated_and_remanded',
  'affirmed_in_part_and_reversed_in_part',
  'granted_vacated_remanded',   -- GVR
  'granted_reversed_remanded',  -- GRR, per the term-stats brief — confirm this reading; not a term used elsewhere in this repo
  'dismissed_as_improvidently_granted', -- DIG
  'cert_denied', 'other'
));
alter table public.cases add constraint cases_disposition_requires_decided
  check (disposition is null or decided_date is not null);

alter table public.cases add column sitting text;
alter table public.cases add constraint cases_sitting_check check (sitting is null or sitting in (
  'october', 'november', 'december', 'january', 'february', 'march', 'april', 'no_argument'
));

-- ---------------------------------------------------------------------------
-- case_lower_courts — the court(s)/docket(s) a SCOTUS case is reviewing.
-- One row per distinct (case, lower court, docket). A non-consolidated
-- case gets exactly one row; a consolidated case gets one row per
-- distinct lower court it combines, which is what lets a circuit
-- scorecard query group by court_id and get one line per circuit even
-- though the consolidated case is a single cases row.
-- ---------------------------------------------------------------------------

create table public.case_lower_courts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  docket_number text,
  created_at timestamptz not null default now(),
  unique (case_id, court_id, docket_number)
);

create index case_lower_courts_case_id_idx on public.case_lower_courts (case_id);
create index case_lower_courts_court_id_idx on public.case_lower_courts (court_id);

alter table public.case_lower_courts enable row level security;
create policy "public read access" on public.case_lower_courts for select to anon, authenticated using (true);
grant select on table public.case_lower_courts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- justice_term_blocs — per-term ideological bloc assignment, needed to
-- compute "ideologically split" (the sitting justices' majority/dissent
-- sides exactly match the conservative/liberal bloc for that term).
-- Manually curated reference data (like courts/people), not derived by
-- any pipeline script.
-- ---------------------------------------------------------------------------

create table public.justice_term_blocs (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  person_id uuid not null references public.people(id) on delete cascade,
  bloc text not null check (bloc in ('conservative', 'liberal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term, person_id)
);

create index justice_term_blocs_person_id_idx on public.justice_term_blocs (person_id);

create trigger justice_term_blocs_set_updated_at
  before update on public.justice_term_blocs
  for each row execute function public.set_updated_at();

alter table public.justice_term_blocs enable row level security;
create policy "public read access" on public.justice_term_blocs for select to anon, authenticated using (true);
grant select on table public.justice_term_blocs to anon, authenticated;
