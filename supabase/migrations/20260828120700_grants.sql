-- Phase 1 follow-up — baseline table privileges.
--
-- Discovered during Phase 1 verification: enable_rls.sql enabled RLS and
-- added SELECT policies, but never granted the underlying table privileges.
-- RLS policies gate which ROWS a role can see; Postgres separately requires
-- a GRANT before a role can touch a table AT ALL — this applies even to
-- service_role, whose BYPASSRLS attribute skips row-level policy checks but
-- not this layer. Without it, service_role got `permission denied for
-- table <x>` (SQLSTATE 42501) on every table, which would have broken the
-- pipeline entirely (it authenticates as service_role) as soon as it tried
-- to read anything.

grant usage on schema public to anon, authenticated, service_role;

-- service_role: full read/write on every table — this is the pipeline's
-- role, matching "the pipeline uses the service-role key" in the plan.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- anon / authenticated: SELECT only, and only on the 22 tables that got a
-- public-read policy in enable_rls.sql. The 5 internal/ops tables
-- (dossiers, dossier_events, pattern_breaks, ingest_runs, revisions)
-- deliberately get no grant here — RLS already default-denies them with no
-- policy, but there's no reason to widen the table-level surface too.
grant select on table
  public.courts, public.people, public.judgeships, public.organizations, public.affiliations,
  public.cases, public.opinions, public.opinion_joins, public.votes, public.case_participations,
  public.key_exchanges, public.citations,
  public.circuit_splits, public.split_positions, public.appellate_impacts,
  public.publications, public.publication_cases, public.publication_people,
  public.amicus_briefs, public.amicus_counsel, public.legal_terms, public.case_terms
to anon, authenticated;

-- Carry these forward automatically for tables created by future
-- migrations, so this gap can't recur silently in Phase 2+.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
