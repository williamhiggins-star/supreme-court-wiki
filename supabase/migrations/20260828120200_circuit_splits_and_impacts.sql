-- Phase 1 (SUPABASE_PLAN.md §1.3) — circuit splits and appellate impacts:
-- circuit_splits, split_positions, appellate_impacts.

-- ---------------------------------------------------------------------------
-- circuit_splits
--
-- Deviation from the plan's SQL sketch: adds `slug text unique`. Every other
-- entity table in the plan carries a natural unique key for idempotent
-- upserts (courts, people, organizations, cases, legal_terms, publications
-- via url); circuit_splits was the one omission, and today's
-- data/circuit-splits.json already keys each split on a kebab-case `id`
-- field that is exactly this. Added so Phase 2's backfill has something to
-- upsert against; flagging in case that reasoning doesn't hold up.
-- ---------------------------------------------------------------------------

create table public.circuit_splits (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  question text not null,
  status text not null check (status in ('open', 'cert_granted', 'resolved')),
  scotus_case_id uuid references public.cases(id) on delete set null, -- null until cert granted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index circuit_splits_scotus_case_id_idx on public.circuit_splits (scotus_case_id);

create trigger circuit_splits_set_updated_at
  before update on public.circuit_splits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- split_positions
-- ---------------------------------------------------------------------------

create table public.split_positions (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references public.circuit_splits(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade, -- the circuit decision taking this side
  position text not null,
  created_at timestamptz not null default now()
);

create index split_positions_split_id_idx on public.split_positions (split_id);
create index split_positions_case_id_idx on public.split_positions (case_id);

-- ---------------------------------------------------------------------------
-- appellate_impacts
-- ---------------------------------------------------------------------------

create table public.appellate_impacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  impact_area text not null check (impact_area in (
    'securities', 'antitrust', 'labor', 'ip', 'arbitration', 'class_actions', 'bankruptcy'
  )),
  direction text not null check (direction in ('business_favorable', 'business_adverse', 'mixed')),
  writeup text,
  created_at timestamptz not null default now()
);

create index appellate_impacts_case_id_idx on public.appellate_impacts (case_id);
