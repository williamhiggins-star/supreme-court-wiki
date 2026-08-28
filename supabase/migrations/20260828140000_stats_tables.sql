-- Phase 3 (SUPABASE_PLAN.md) — dual-write for compute-justice-stats.ts and
-- compute-lawyer-stats.ts. Mirrors data/justices.json / data/lawyers.json's
-- current shape exactly — same deterministic computation as today (parsed
-- from oral-argument transcript speaking turns), just also persisted.
--
-- Not part of the original Phase 1 §1 schema (that section explicitly
-- deferred these — see the Phase 2 backfill report's "DECIDED — dedicated
-- stats table(s), computed by a script" note). Both tables are fully
-- replaced on every run (delete-all + insert-fresh) rather than upserted
-- row-by-row, matching how data/justices.json and data/lawyers.json are
-- themselves fully recomputed from scratch each time, not merged.

create table public.justice_stats (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  person_id uuid not null references public.people(id) on delete cascade,
  questions int not null default 0,
  total_words int not null default 0,
  estimated_minutes numeric not null default 0,
  cases_participated int not null default 0,
  majority_opinions int not null default 0,
  concurrences int not null default 0,
  dissents int not null default 0,
  updated_at timestamptz not null default now(),
  unique (term, person_id)
);

create index justice_stats_person_id_idx on public.justice_stats (person_id);

create table public.lawyer_stats (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  label text not null,             -- courtroom speaker label, e.g. "MR. CLEMENT" — natural key alongside term
  person_id uuid references public.people(id) on delete set null,
  name text not null,              -- display name, e.g. "Mr. Clement"
  total_words int not null default 0,
  estimated_minutes numeric not null default 0,
  cases_argued int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now(),
  unique (term, label)
);

create index lawyer_stats_person_id_idx on public.lawyer_stats (person_id);

-- RLS: same "published content" treatment as every other content table.
alter table public.justice_stats enable row level security;
create policy "public read access" on public.justice_stats for select to anon, authenticated using (true);

alter table public.lawyer_stats enable row level security;
create policy "public read access" on public.lawyer_stats for select to anon, authenticated using (true);

grant select on table public.justice_stats, public.lawyer_stats to anon, authenticated;
