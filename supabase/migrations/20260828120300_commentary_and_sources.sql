-- Phase 1 (SUPABASE_PLAN.md §1.4) — commentary and secondary sources:
-- publications, publication_cases, publication_people, amicus_briefs,
-- amicus_counsel, legal_terms, case_terms.

-- ---------------------------------------------------------------------------
-- publications
-- ---------------------------------------------------------------------------

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('law_review', 'journalism', 'opinion', 'podcast_episode')),
  source_org_id uuid references public.organizations(id) on delete set null,
  title text not null,
  author_text text,
  url text not null unique,
  published_at date,
  summary text,                          -- Claude-written, as today
  created_at timestamptz not null default now()
);

create index publications_source_org_id_idx on public.publications (source_org_id);

-- ---------------------------------------------------------------------------
-- publication_cases / publication_people
-- ---------------------------------------------------------------------------

create table public.publication_cases (
  publication_id uuid not null references public.publications(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  relevance text,
  primary key (publication_id, case_id)
);

create index publication_cases_case_id_idx on public.publication_cases (case_id);

create table public.publication_people (
  publication_id uuid not null references public.publications(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (publication_id, person_id)
);

create index publication_people_person_id_idx on public.publication_people (person_id);

-- ---------------------------------------------------------------------------
-- amicus_briefs / amicus_counsel
-- ---------------------------------------------------------------------------

create table public.amicus_briefs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  filer_org_id uuid references public.organizations(id) on delete set null,
  side text not null check (side in ('petitioner', 'respondent', 'neither')),
  filed_date date,
  brief_url text,
  summary text,
  created_at timestamptz not null default now()
);

create index amicus_briefs_case_id_idx on public.amicus_briefs (case_id);
create index amicus_briefs_filer_org_id_idx on public.amicus_briefs (filer_org_id);

create table public.amicus_counsel (
  brief_id uuid not null references public.amicus_briefs(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (brief_id, person_id)
);

create index amicus_counsel_person_id_idx on public.amicus_counsel (person_id);

-- ---------------------------------------------------------------------------
-- legal_terms / case_terms
-- ---------------------------------------------------------------------------

create table public.legal_terms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  term text not null,
  definition text not null,
  created_at timestamptz not null default now()
);

create table public.case_terms (
  case_id uuid not null references public.cases(id) on delete cascade,
  term_id uuid not null references public.legal_terms(id) on delete cascade,
  primary key (case_id, term_id)
);

create index case_terms_term_id_idx on public.case_terms (term_id);
