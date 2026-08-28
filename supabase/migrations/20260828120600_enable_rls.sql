-- Phase 1 (SUPABASE_PLAN.md §1.7) — "RLS everywhere: anon role gets SELECT
-- on published content tables only; the pipeline uses the service-role key;
-- user tables are per-user."
--
-- No user tables exist yet (§1.6 is explicitly out of scope for Phase 1), so
-- there is nothing per-user to restrict here. Every table below gets RLS
-- enabled. Two groups:
--
--   1. Published content tables (22) — the relational equivalent of what's
--      already public today in data/*.json. Get a `select` policy for
--      `anon` and `authenticated`.
--   2. Internal/ops tables (5): dossiers, dossier_events, pattern_breaks,
--      ingest_runs, revisions. RLS is enabled but no policy is added, which
--      means default-deny for anon/authenticated. The pipeline's
--      service-role key bypasses RLS entirely (Supabase's `service_role`
--      Postgres role has BYPASSRLS) and is unaffected either way.
--
-- All writes go through the service role (the daily pipeline), so none of
-- these policies include insert/update/delete grants — that matches "the
-- pipeline uses the service-role key" from the plan.

-- ---------------------------------------------------------------------------
-- Group 1 — published content tables
-- ---------------------------------------------------------------------------

alter table public.courts enable row level security;
create policy "public read access" on public.courts for select to anon, authenticated using (true);

alter table public.people enable row level security;
create policy "public read access" on public.people for select to anon, authenticated using (true);

alter table public.judgeships enable row level security;
create policy "public read access" on public.judgeships for select to anon, authenticated using (true);

alter table public.organizations enable row level security;
create policy "public read access" on public.organizations for select to anon, authenticated using (true);

alter table public.affiliations enable row level security;
create policy "public read access" on public.affiliations for select to anon, authenticated using (true);

alter table public.cases enable row level security;
create policy "public read access" on public.cases for select to anon, authenticated using (true);

alter table public.opinions enable row level security;
create policy "public read access" on public.opinions for select to anon, authenticated using (true);

alter table public.opinion_joins enable row level security;
create policy "public read access" on public.opinion_joins for select to anon, authenticated using (true);

alter table public.votes enable row level security;
create policy "public read access" on public.votes for select to anon, authenticated using (true);

alter table public.case_participations enable row level security;
create policy "public read access" on public.case_participations for select to anon, authenticated using (true);

alter table public.key_exchanges enable row level security;
create policy "public read access" on public.key_exchanges for select to anon, authenticated using (true);

alter table public.citations enable row level security;
create policy "public read access" on public.citations for select to anon, authenticated using (true);

alter table public.circuit_splits enable row level security;
create policy "public read access" on public.circuit_splits for select to anon, authenticated using (true);

alter table public.split_positions enable row level security;
create policy "public read access" on public.split_positions for select to anon, authenticated using (true);

alter table public.appellate_impacts enable row level security;
create policy "public read access" on public.appellate_impacts for select to anon, authenticated using (true);

alter table public.publications enable row level security;
create policy "public read access" on public.publications for select to anon, authenticated using (true);

alter table public.publication_cases enable row level security;
create policy "public read access" on public.publication_cases for select to anon, authenticated using (true);

alter table public.publication_people enable row level security;
create policy "public read access" on public.publication_people for select to anon, authenticated using (true);

alter table public.amicus_briefs enable row level security;
create policy "public read access" on public.amicus_briefs for select to anon, authenticated using (true);

alter table public.amicus_counsel enable row level security;
create policy "public read access" on public.amicus_counsel for select to anon, authenticated using (true);

alter table public.legal_terms enable row level security;
create policy "public read access" on public.legal_terms for select to anon, authenticated using (true);

alter table public.case_terms enable row level security;
create policy "public read access" on public.case_terms for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Group 2 — internal / ops tables: RLS enabled, no policies (default deny
-- to anon and authenticated; service_role bypasses RLS regardless).
-- ---------------------------------------------------------------------------

alter table public.dossiers enable row level security;
alter table public.dossier_events enable row level security;
alter table public.pattern_breaks enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.revisions enable row level security;
