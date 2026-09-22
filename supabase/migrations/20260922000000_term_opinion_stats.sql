-- term_opinion_stats — materialized cache of the Opinions Data panel's 8
-- term-stat reads (term-stats.ts / justice-stats.ts), populated by the
-- nightly pipeline (scripts/compute-opinion-term-stats.ts) instead of
-- computed live on every dashboard render. Schema option A1 from the
-- "materializing Opinions Data term stats" investigation (2026-09-22):
-- one row per (term, metric_type), JSONB payload — the same term-keyed,
-- full-replace shape public.justice_stats/public.lawyer_stats already use
-- (20260828140000_stats_tables.sql), not a table per term. metric_type is
-- data, not schema, matching this repo's standing convention that
-- categorical/taxonomy values (term included) never become table names —
-- see that investigation's point 3 for why a per-term table was rejected.
--
-- The 8 functions this caches are UNCHANGED by this migration: they still
-- exist, are still individually queryable, and remain what the population
-- script calls. This table has no reader yet — cutting the live dashboard
-- over to read from here instead of calling those functions per-render is
-- explicitly out of scope (see that investigation's point 6) and is not
-- done by this migration.
--
-- Not typed per-metric (no opinion_length/agreement_grid/... columns):
-- the investigation's point 2 found only 2 of the 8 payloads (total words
-- by justice, majority/minority rate) are flat enough to type, and
-- splitting just those two out while leaving the other six as JSONB would
-- buy nothing — nothing here queries or filters on a payload's internal
-- fields, only ever reads the whole row for one (term, metric_type).

create table public.term_opinion_stats (
  term text not null,
  metric_type text not null check (metric_type in (
    'opinion_length', 'agreement_grid', 'joiner_highlights',
    'concurrence_join_matrix', 'dissent_join_matrix',
    'total_words_by_justice', 'majority_minority_rate', 'justice_stats'
  )),
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (term, metric_type)
);

-- RLS: same "public read access" treatment as every other content table
-- (justice_stats/lawyer_stats immediately above are the closest
-- precedent) — reads go through the anon-key client the live site
-- already uses; writes are service-role-only, via the population script.
alter table public.term_opinion_stats enable row level security;
create policy "public read access" on public.term_opinion_stats for select to anon, authenticated using (true);

grant select on table public.term_opinion_stats to anon, authenticated;
