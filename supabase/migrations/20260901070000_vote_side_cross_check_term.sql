-- term_stats_vote_side_cross_check was the one view among the 23
-- term_stats_* views with no `term` column in its output (its base view,
-- term_stats_case_sides, never joins cases) -- found during the
-- multi-term-readiness investigation. A caller couldn't filter/group it
-- by term without joining back to cases themselves. Quick fix, not a
-- restructure: join cases for c.term, same as every other view already
-- does. Nothing else in this schema selects from this view (checked),
-- so a clean drop+recreate is safe -- CREATE OR REPLACE VIEW can only
-- append columns at the end, and `term` reads more naturally placed
-- right after case_id, matching every other view's convention.

drop view public.term_stats_vote_side_cross_check;

create view public.term_stats_vote_side_cross_check
with (security_invoker = true) as
with tie_side as (
  select
    dt.case_id,
    dt.person_id,
    bool_or(o.kind in ('concur_dissent', 'dissent_in_part', 'dissent')) as has_dissent_tie,
    bool_or(o.kind in ('majority', 'plurality', 'concurrence', 'concurrence_in_judgment', 'concurrence_in_part')) as has_majority_tie
  from public.decision_ties dt
  join public.opinions o on o.id = dt.opinion_id
  group by dt.case_id, dt.person_id
)
select
  s.case_id,
  c.term,
  s.person_id,
  s.position,
  s.side as stored_side,
  case
    when ts.person_id is null then null
    when ts.has_dissent_tie then 'dissent'
    when ts.has_majority_tie then 'majority'
    else null
  end as derived_side,
  case
    when ts.person_id is null then 'unverifiable_no_decision_ties_row'
    when ts.has_dissent_tie and s.side = 'dissent' then 'match'
    when ts.has_majority_tie and not ts.has_dissent_tie and s.side = 'majority' then 'match'
    else 'mismatch'
  end as check_status
from public.term_stats_case_sides s
join public.cases c on c.id = s.case_id
left join tie_side ts on ts.case_id = s.case_id and ts.person_id = s.person_id;

comment on view public.term_stats_vote_side_cross_check is
  'Coding-rules.md §11: compares decision_ties/opinions.kind-derived side against the stored decisions.position for every participating justice. check_status is match / mismatch / unverifiable_no_decision_ties_row — the third is expected to dominate today for "silent majority" justices, per §11''s documented pipeline gap. Never used to overwrite decisions; surfaced as-is for review.';

grant select on public.term_stats_vote_side_cross_check to anon, authenticated;
