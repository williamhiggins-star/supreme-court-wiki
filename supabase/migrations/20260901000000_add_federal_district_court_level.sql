-- Adds 'federal_district' to courts.level. Needed for Mullin v. Doe's
-- lower court (U.S. District Court for the Southern District of New
-- York) — a direct district-to-SCOTUS case, which doesn't fit any of
-- the existing four levels (scotus / federal_appellate / state_supreme /
-- state_appellate, the last added in 20260828120800_statutes.sql for the
-- same reason: a real lower court that didn't fit the original three).
--
-- No change needed to courts_state_matches_level — federal_district
-- doesn't require `state`, same as federal_appellate and scotus.

alter table public.courts drop constraint courts_level_check;
alter table public.courts add constraint courts_level_check
  check (level in ('scotus', 'federal_appellate', 'state_supreme', 'state_appellate', 'federal_district'));
