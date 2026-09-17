-- Docket "Proceedings and Orders" entries -- a dedicated table, not a
-- column on cases, same reasoning as 20260901020000_oral_argument_transcripts.sql:
-- this is many rows per case (up to ~100+ for a heavily-briefed case, see
-- Suncor/25-170's 115), not case metadata, and it keeps growing well past
-- "upcoming" status as merits/amicus briefs and orders accumulate.

create table public.docket_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  entry_date date not null,
  description text not null,
  document_type text not null check (document_type in (
    'petition_response', 'merits_brief', 'amicus_brief',
    'motion', 'order_scheduling', 'record', 'other'
  )),
  sort_order integer not null,           -- stable chronological order (page order, not entry_date -- same-day entries need a tiebreaker)
  documents jsonb not null default '[]'::jsonb, -- [{label, url}, ...], 0-N linked PDFs for this entry
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index docket_entries_case_id_idx on public.docket_entries (case_id);

create trigger docket_entries_set_updated_at
  before update on public.docket_entries
  for each row execute function public.set_updated_at();

alter table public.docket_entries enable row level security;
create policy "public read access" on public.docket_entries for select to anon, authenticated using (true);
grant select on table public.docket_entries to anon, authenticated;
