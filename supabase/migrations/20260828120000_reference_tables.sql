-- Phase 1 (SUPABASE_PLAN.md §1.1) — reference tables: courts, people,
-- judgeships, organizations, affiliations.
--
-- gen_random_uuid() is built into PostgreSQL 13+ (no pgcrypto extension
-- needed) — this project runs Postgres 17.

-- Shared helper: keeps `updated_at` current on every UPDATE. Reused by
-- every content table that has an updated_at column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- courts
-- ---------------------------------------------------------------------------

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,                    -- "Supreme Court of the United States", "Ninth Circuit", "Texas Supreme Court"
  level text not null check (level in ('scotus', 'federal_appellate', 'state_supreme')),
  -- Convention (not stated explicitly in the plan): 1-11 for the numbered
  -- circuits, 12 for the D.C. Circuit, 13 for the Federal Circuit, null for
  -- SCOTUS and state supreme courts. Only meaningful for federal_appellate.
  circuit_ordinal int,
  state text,                            -- full state name; null unless level = 'state_supreme'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courts_state_matches_level check (
    (level = 'state_supreme' and state is not null) or
    (level <> 'state_supreme' and state is null)
  ),
  constraint courts_circuit_ordinal_only_federal check (
    circuit_ordinal is null or level = 'federal_appellate'
  )
);

-- One court per circuit ordinal (partial: only enforced where set).
create unique index courts_circuit_ordinal_key on public.courts (circuit_ordinal)
  where circuit_ordinal is not null;

create trigger courts_set_updated_at
  before update on public.courts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------

create table public.people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  full_name text not null,
  short_name text,
  born date,
  died date,
  bio_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_died_after_born check (died is null or born is null or died >= born)
);

create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- judgeships — a person's seat on a court, with history
-- ---------------------------------------------------------------------------

create table public.judgeships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  title text not null,                   -- "Associate Justice", "Chief Judge"
  is_chief boolean not null default false,
  appointed_by text,                     -- nominating president, free text per plan
  start_date date,
  end_date date,                         -- null = sitting
  created_at timestamptz not null default now(),
  constraint judgeships_end_after_start check (end_date is null or start_date is null or end_date >= start_date),
  -- Lets seed/backfill scripts use ON CONFLICT ... DO NOTHING for idempotency.
  constraint judgeships_unique_seat unique (person_id, court_id, start_date)
);

create index judgeships_person_id_idx on public.judgeships (person_id);
create index judgeships_court_id_idx on public.judgeships (court_id);

-- ---------------------------------------------------------------------------
-- organizations — firms, SG's office, amici filers, publishers
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in (
    'law_firm', 'government', 'nonprofit', 'trade_assoc',
    'state_ag', 'academic', 'publisher', 'other'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- affiliations
-- ---------------------------------------------------------------------------

create table public.affiliations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  constraint affiliations_end_after_start check (end_date is null or start_date is null or end_date >= start_date)
);

create index affiliations_person_id_idx on public.affiliations (person_id);
create index affiliations_org_id_idx on public.affiliations (org_id);
