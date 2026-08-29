-- Phase 6 — decision_ties + decisions: a richer replacement for votes,
-- capturing full majority/plurality/concurrence/concur-dissent/dissent
-- membership (author vs. joiner) instead of votes' single majority/
-- dissent/recused side. Computed by the pipeline using the exact same
-- priority logic the site renders with (src/lib/decisionSides.ts), so the
-- database and the site can never disagree.
--
-- votes is NOT dropped or modified here — it stays exactly as today,
-- untouched by the new write path. A separate migration will deprecate it
-- once decisions/decision_ties are verified against a full backfill.
--
-- Scope decisions (confirmed 2026-08-28):
--   - join_scope_detail (which Parts of a majority a plurality-joiner
--     signed onto) has no structured source in data/cases/*.json today.
--     join_scope is always written as 'full'; 'partial' + join_scope_detail
--     exist in the schema for whenever that data becomes available, but
--     nothing writes them yet.
--   - Recusal has no structured field in data/cases/*.json either. A
--     recused justice today produces no votes row (same gap already
--     present in the existing votes table); decisions carries the same
--     limitation forward — see the write.ts/backfill-db.ts diff notes.
--     'recused' / 'did_not_participate' exist in the position enum for
--     future use, but nothing writes them yet.

-- ---------------------------------------------------------------------------
-- opinions.kind — add 'concur_dissent' (the only genuinely missing value;
-- 'plurality' is already present from the original migration and is
-- re-included here only because the whole constraint has to be recreated).
-- ---------------------------------------------------------------------------

alter table public.opinions drop constraint opinions_kind_check;
alter table public.opinions add constraint opinions_kind_check check (kind in (
  'majority', 'plurality', 'per_curiam',
  'concurrence', 'concurrence_in_judgment', 'concur_dissent', 'dissent'
));

-- ---------------------------------------------------------------------------
-- decision_ties — one row per (person, opinion): who's tied to which
-- specific opinion and how (wrote it, or joined it without writing it).
-- Full-fidelity source for decisions below; also the natural home for
-- future partial-join detail (join_scope_detail).
-- ---------------------------------------------------------------------------

create table public.decision_ties (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  opinion_id uuid not null references public.opinions(id) on delete cascade,
  role text not null check (role in ('author', 'joiner')),
  join_scope text not null default 'full' check (join_scope in ('full', 'partial')),
  join_scope_detail text,
  created_at timestamptz not null default now(),
  unique (person_id, opinion_id)
);

create index decision_ties_case_id_idx on public.decision_ties (case_id);
create index decision_ties_person_id_idx on public.decision_ties (person_id);
create index decision_ties_opinion_id_idx on public.decision_ties (opinion_id);

-- ---------------------------------------------------------------------------
-- decisions — one row per (case, person): the resolved, single "what side"
-- summary, computed with the same priority order as decisionSides.ts
-- (concur/dissent > dissent > plurality > majority, author beats joiner).
-- Most queries (justice_stats, case pages) should read from here;
-- decision_ties is for "show me exactly which opinion(s)".
-- ---------------------------------------------------------------------------

create table public.decisions (
  case_id uuid not null references public.cases(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  position text not null check (position in (
    'majority', 'plurality', 'concurrence', 'concur_dissent', 'dissent',
    'recused', 'did_not_participate'
  )),
  primary_tie_id uuid references public.decision_ties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (case_id, person_id)
);

create index decisions_person_id_idx on public.decisions (person_id);

-- ---------------------------------------------------------------------------
-- RLS + grants — same "published content, public read" treatment as
-- opinions/votes/opinion_joins (enable_rls.sql / grants.sql), added here
-- since those migrations already ran. service_role gets full access
-- automatically via the standing `alter default privileges` in
-- grants.sql; only the anon/authenticated read policy needs adding here.
-- ---------------------------------------------------------------------------

alter table public.decision_ties enable row level security;
create policy "public read access" on public.decision_ties for select to anon, authenticated using (true);

alter table public.decisions enable row level security;
create policy "public read access" on public.decisions for select to anon, authenticated using (true);

grant select on table public.decision_ties, public.decisions to anon, authenticated;
