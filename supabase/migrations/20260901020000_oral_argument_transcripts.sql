-- Oral argument transcripts -- a dedicated table, not a column on cases,
-- since transcripts are large (roughly 200KB raw per case) and represent
-- one distinct argument session per case, not case metadata. No prior
-- Phase 0-1 transcripts table was ever applied to this DB; only the
-- aggregated per-speaker stats derived FROM a transcript (justice_stats,
-- lawyer_stats, 20260828140000_stats_tables.sql) were ever persisted --
-- the raw text itself was fetched fresh and discarded on every run of
-- compute-justice-stats.ts / compute-lawyer-stats.ts.

create table public.oral_argument_transcripts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  transcript_text text not null,
  source_url text not null,
  argued_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id)
);

create index oral_argument_transcripts_case_id_idx on public.oral_argument_transcripts (case_id);

create trigger oral_argument_transcripts_set_updated_at
  before update on public.oral_argument_transcripts
  for each row execute function public.set_updated_at();

alter table public.oral_argument_transcripts enable row level security;
create policy "public read access" on public.oral_argument_transcripts for select to anon, authenticated using (true);
grant select on table public.oral_argument_transcripts to anon, authenticated;
