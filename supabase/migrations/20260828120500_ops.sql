-- Phase 1 (SUPABASE_PLAN.md §1.7) — ops: ingest_runs, revisions.
--
-- Scope note: the plan describes `revisions` as populated by an
-- insert/update trigger on cases/opinions/publications/dossiers, wired to
-- the pipeline's current ingest_runs.id. That wiring is pipeline behavior
-- (it needs the pipeline to tell Postgres which run is active, e.g. via a
-- session GUC) and is deferred to whichever phase actually replaces the
-- git-diff audit trail — out of scope for "schema and seed data only". The
-- table exists and is ready; nothing writes to it yet.

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  stats jsonb not null default '{}'::jsonb
);

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  snapshot jsonb not null,
  run_id uuid references public.ingest_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index revisions_table_row_idx on public.revisions (table_name, row_id);
create index revisions_run_id_idx on public.revisions (run_id);
