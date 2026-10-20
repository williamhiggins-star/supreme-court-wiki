-- Status rename: the Court's names for the two pre-decision stages.
--   petition → argued             (the old name meant "argued")
--   upcoming → set_for_argument
-- and a set_for_argument case must have its argument date.
--
-- Order (STATUS-RENAME plan): the site already reads both names (deployed
-- 2026-10-20); the pipeline writes the new names from the same day
-- (scripts/lib/sd-db/write.ts deriveStatus). The term-stats views only
-- test status = 'decided', so no stat can change.

alter table public.cases drop constraint cases_status_check;

update public.cases set status = 'argued' where status = 'petition';
update public.cases set status = 'set_for_argument' where status = 'upcoming';

alter table public.cases add constraint cases_status_check
  check (status in ('granted', 'set_for_argument', 'argued', 'decided', 'historic', 'stub'));

alter table public.cases add constraint cases_set_for_argument_has_date
  check (status <> 'set_for_argument' or argued_date is not null);
