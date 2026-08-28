-- Phase 1 (SUPABASE_PLAN.md §1.2) — cases and decisions: cases, opinions,
-- opinion_joins, votes, case_participations, key_exchanges, citations.

-- ---------------------------------------------------------------------------
-- cases
-- ---------------------------------------------------------------------------

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  court_id uuid not null references public.courts(id) on delete restrict,
  docket_number text,
  caption text not null,                 -- "Hamm v. Smith"
  term text,                             -- "OT2025", or a year for lower courts
  status text not null check (status in ('petition', 'upcoming', 'argued', 'decided', 'historic', 'stub')),
  question_presented text,
  background text,
  significance text,
  argued_date date,
  decided_date date,
  vote_line text,                        -- "6-3"
  source_urls jsonb not null default '[]'::jsonb,
  is_stub boolean not null default false, -- lightweight precedent stub awaiting enrichment
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_decided_after_argued check (decided_date is null or argued_date is null or decided_date >= argued_date)
);

create index cases_court_id_idx on public.cases (court_id);
create index cases_status_idx on public.cases (status);

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- opinions
-- ---------------------------------------------------------------------------

create table public.opinions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null check (kind in (
    'majority', 'plurality', 'per_curiam',
    'concurrence', 'concurrence_in_judgment', 'dissent'
  )),
  author_id uuid references public.people(id) on delete set null,
  summary text,
  full_text_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opinions_case_id_idx on public.opinions (case_id);
create index opinions_author_id_idx on public.opinions (author_id);

create trigger opinions_set_updated_at
  before update on public.opinions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- opinion_joins — who joined which opinion
-- ---------------------------------------------------------------------------

create table public.opinion_joins (
  opinion_id uuid not null references public.opinions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (opinion_id, person_id)
);

create index opinion_joins_person_id_idx on public.opinion_joins (person_id);

-- ---------------------------------------------------------------------------
-- votes — majority / dissent / recused
-- ---------------------------------------------------------------------------

create table public.votes (
  case_id uuid not null references public.cases(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  side text not null check (side in ('majority', 'dissent', 'recused')),
  primary key (case_id, person_id)
);

create index votes_person_id_idx on public.votes (person_id);

-- ---------------------------------------------------------------------------
-- case_participations — advocates and parties
-- ---------------------------------------------------------------------------

create table public.case_participations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null check (role in (
    'argued_petitioner', 'argued_respondent', 'counsel_of_record', 'on_brief'
  )),
  party_name text,
  created_at timestamptz not null default now()
);

create index case_participations_case_id_idx on public.case_participations (case_id);
create index case_participations_person_id_idx on public.case_participations (person_id);

-- ---------------------------------------------------------------------------
-- key_exchanges
-- ---------------------------------------------------------------------------

create table public.key_exchanges (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  justice_id uuid references public.people(id) on delete set null,
  advocate_id uuid references public.people(id) on delete set null,
  exchange text not null,
  significance text,
  created_at timestamptz not null default now()
);

create index key_exchanges_case_id_idx on public.key_exchanges (case_id);
create index key_exchanges_justice_id_idx on public.key_exchanges (justice_id);
create index key_exchanges_advocate_id_idx on public.key_exchanges (advocate_id);

-- ---------------------------------------------------------------------------
-- citations — the graph that connects everything
-- ---------------------------------------------------------------------------

create table public.citations (
  citing_case_id uuid not null references public.cases(id) on delete cascade,
  cited_case_id uuid not null references public.cases(id) on delete cascade,
  treatment text not null check (treatment in (
    'relied_on', 'distinguished', 'questioned', 'overruled', 'cited'
  )),
  context text,
  created_at timestamptz not null default now(),
  primary key (citing_case_id, cited_case_id),
  constraint citations_no_self_reference check (citing_case_id <> cited_case_id)
);

create index citations_cited_case_id_idx on public.citations (cited_case_id);
