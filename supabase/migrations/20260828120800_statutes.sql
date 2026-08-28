-- Phase 2 follow-up — statutes and statute_citations.
--
-- Discovered during the Phase 2 backfill dry run: data/cases/*.json's
-- citedPrecedents[] occasionally cites a statute (e.g. 42 U.S.C. §1983, the
-- Administrative Procedure Act) rather than a prior court decision. These
-- were previously stored as data/precedents/*.json stubs and would have
-- landed in `cases` via the backfill, which is wrong on two counts: a
-- statute isn't a case (no court decided it, no majority/dissent), and
-- routing it through `citations` (case-to-case) misrepresents the
-- relationship. Not in the original SUPABASE_PLAN.md §1 schema — added here
-- as its own small migration rather than folded into the Phase 1 tables.
--
-- Follows the same stub-on-first-reference pattern citations already uses:
-- a case citing an unknown statute creates the statute row (citation + name
-- only) rather than dropping the edge.
--
-- Also widens courts.level: the Phase 1 backfill dry run found a precedent
-- (ybarra-v-spangard, cited at 208 P.2d 445) whose actual deciding court is
-- the California Court of Appeal — an INTERMEDIATE state appellate court,
-- which didn't fit any of the three original level values (scotus /
-- federal_appellate / state_supreme). Adds 'state_appellate' and widens the
-- state-not-null constraint to cover it too. courts_level_check and
-- courts_state_matches_level were both created in the already-applied
-- 20260828120000_reference_tables.sql migration, so they're altered here
-- rather than edited in place.

alter table public.courts drop constraint courts_level_check;
alter table public.courts add constraint courts_level_check
  check (level in ('scotus', 'federal_appellate', 'state_supreme', 'state_appellate'));

alter table public.courts drop constraint courts_state_matches_level;
alter table public.courts add constraint courts_state_matches_level
  check (
    (level in ('state_supreme', 'state_appellate') and state is not null) or
    (level not in ('state_supreme', 'state_appellate') and state is null)
  );

create table public.statutes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  citation text not null,          -- e.g. "42 U.S.C. § 1983"
  name text not null,               -- e.g. "Civil Rights Act of 1871, §1983"
  jurisdiction text,                 -- "federal", or a state name; nullable when not confidently known
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger statutes_set_updated_at
  before update on public.statutes
  for each row execute function public.set_updated_at();

create table public.statute_citations (
  citing_case_id uuid not null references public.cases(id) on delete cascade,
  statute_id uuid not null references public.statutes(id) on delete cascade,
  context text,
  created_at timestamptz not null default now(),
  primary key (citing_case_id, statute_id)
);

create index statute_citations_statute_id_idx on public.statute_citations (statute_id);

-- RLS: same "published content" treatment as the other 22 public tables
-- (see enable_rls.sql). service_role's access comes from the default
-- privileges already set up in grants.sql (ALTER DEFAULT PRIVILEGES ... FOR
-- ROLE postgres ... GRANT ... TO service_role), so no explicit grant is
-- needed there — only anon/authenticated need one, same as every other
-- content table.

alter table public.statutes enable row level security;
create policy "public read access" on public.statutes for select to anon, authenticated using (true);

alter table public.statute_citations enable row level security;
create policy "public read access" on public.statute_citations for select to anon, authenticated using (true);

grant select on table public.statutes, public.statute_citations to anon, authenticated;
