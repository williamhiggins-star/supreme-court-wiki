-- Petitioner/respondent argument data. data/cases/*.json's `parties` field
-- (CaseSummary.parties: PartyArgument[]) is richer than a bare name --
-- each entry carries { party, role, coreArgument, supportingPoints,
-- keyExchanges }. This migration matches that granularity for the party
-- name and argument content (what the existing PartyArgumentPanel /
-- "Petitioner"/"Respondent" menu items in CaseDetailPanels.tsx render);
-- keyExchanges is a separate, still-open question -- it's per-party in the
-- JSON but public.key_exchanges is per-case with no party/role linkage, a
-- different granularity, and left alone here rather than half-migrated.
--
-- supporting_points is jsonb (array of strings), matching this schema's
-- existing convention for array-shaped columns (cases.source_urls) rather
-- than introducing this schema's first text[] column.

alter table public.cases add column petitioner_name text;
alter table public.cases add column petitioner_argument text;
alter table public.cases add column petitioner_supporting_points jsonb not null default '[]'::jsonb;

alter table public.cases add column respondent_name text;
alter table public.cases add column respondent_argument text;
alter table public.cases add column respondent_supporting_points jsonb not null default '[]'::jsonb;
