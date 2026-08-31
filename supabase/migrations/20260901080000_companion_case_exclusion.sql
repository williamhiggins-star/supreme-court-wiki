-- Companion-docket exclusion — one shared rule, referenced by both a
-- term_stats view and the app's docket-panel query (src/lib/db/cases.ts),
-- per coding-rules.md §8's "consolidated companions" (e.g. Little v.
-- Hecox, docket 24-38, consolidated into West Virginia v. B.P.J., docket
-- 24-43). A companion case's own `cases` row can carry real content
-- (commentary, legal-term tags, oral-argument key exchanges, citing-case
-- citations — confirmed non-empty for Hecox) even though its decision
-- content lives entirely on the primary case's case_id. It must not be
-- double-counted or double-listed alongside its primary case.

create view public.term_stats_companion_cases
with (security_invoker = true) as
select distinct c.id as case_id, c.term, c.docket_number
from public.cases c
join public.case_lower_courts clc
  on clc.docket_number = c.docket_number
 and clc.case_id != c.id;

comment on view public.term_stats_companion_cases is
  'Cases whose own docket_number is recorded as a companion-docket case_lower_courts row under a DIFFERENT case (coding-rules.md §8) -- e.g. Little v. Hecox under West Virginia v. B.P.J. Exclude these from any case-level count or listing that already covers them via their primary case.';

grant select on table public.term_stats_companion_cases to anon, authenticated;

-- term_stats_days_to_decision reads straight from `cases` with no join
-- to opinions/decisions (unlike every other decided-case view in this
-- schema), so it's the one view a companion case's decided_date would
-- silently double-count in. Recreated here with the exclusion added;
-- everything else about the view is unchanged from its original
-- definition in 20260831090000_term_stats_views.sql.
create or replace view public.term_stats_days_to_decision
with (security_invoker = true) as
select
  c.id as case_id, c.slug, c.caption, c.term, c.argued_date, c.decided_date,
  (c.decided_date - c.argued_date) as days_to_decision
from public.cases c
where c.status = 'decided'
  and c.argued_date is not null
  and c.decided_date is not null
  and c.id not in (select case_id from public.term_stats_companion_cases);
