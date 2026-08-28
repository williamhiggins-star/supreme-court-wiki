-- Phase 1 (SUPABASE_PLAN.md §1.5) — institutional knowledge layer (the DYSTL
-- analogue): dossiers, dossier_events, pattern_breaks.
--
-- Scope note: this migration creates the tables only. The plan's
-- generation-time injection into pipeline.ts's prompt assembly and the
-- post-publish four-action update hook are pipeline behavior, not schema —
-- out of scope for Phase 1 ("do not touch the existing pipeline"). That's
-- Phase 5.

-- ---------------------------------------------------------------------------
-- dossiers
-- ---------------------------------------------------------------------------

create table public.dossiers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('doctrine', 'justice', 'advocate', 'court', 'term')),
  subject_person_id uuid references public.people(id) on delete cascade,   -- justice / advocate dossiers
  subject_court_id uuid references public.courts(id) on delete cascade,
  subject_slug text,                     -- doctrine dossiers: 'major-questions', 'standing', ...
  established_facts jsonb not null default '{}'::jsonb,
  analytical_positions jsonb not null default '{}'::jsonb,
  open_threads jsonb not null default '{}'::jsonb,
  prior_positions jsonb not null default '{}'::jsonb, -- superseded views, kept for the record
  semantic_summary text,                 -- 2-3 sentence fingerprint, regenerated post-publish
  case_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dossiers_has_a_subject check (
    subject_person_id is not null or subject_court_id is not null or subject_slug is not null
  )
);

create index dossiers_subject_person_id_idx on public.dossiers (subject_person_id);
create index dossiers_subject_court_id_idx on public.dossiers (subject_court_id);
create index dossiers_subject_slug_idx on public.dossiers (subject_slug);

create trigger dossiers_set_updated_at
  before update on public.dossiers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- dossier_events — the CONFIRM/REFINE/CHALLENGE/SUPERSEDE log
-- ---------------------------------------------------------------------------

create table public.dossier_events (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  action text not null check (action in ('confirm', 'refine', 'challenge', 'supersede')),
  triggered_by_case_id uuid references public.cases(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index dossier_events_dossier_id_idx on public.dossier_events (dossier_id);
create index dossier_events_triggered_by_case_id_idx on public.dossier_events (triggered_by_case_id);

-- ---------------------------------------------------------------------------
-- pattern_breaks
-- ---------------------------------------------------------------------------

create table public.pattern_breaks (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  description text not null,             -- "Gorsuch joined the pragmatist bloc against the textualist reading he took in X"
  significance text,
  created_at timestamptz not null default now()
);

create index pattern_breaks_dossier_id_idx on public.pattern_breaks (dossier_id);
create index pattern_breaks_case_id_idx on public.pattern_breaks (case_id);
