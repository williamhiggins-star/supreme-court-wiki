-- emergency_shadow_docket_public: the read-only public face of the
-- Emergency / Shadow Docket table, for the dashboard's Shadow Docket
-- section (read server-side with the anon key, like every other public
-- read on the site).
--
-- Only rows with public_view = true, and only these columns. Visitors get
-- no access to emergency_shadow_docket or application_details themselves
-- (both stay revoked from anon/authenticated); this view is their only way
-- in. Not shown: rule_version, built_at, public_view, the hand-set marker,
-- docket entries, outcome text, and anything about attorneys.
--
-- Unlike the term_stats_* views (security_invoker = true, over tables that
-- are already public), this view runs with its owner's rights: its base
-- tables are deliberately closed to visitors, so an invoker view would
-- return nothing, and opening the tables would give direct access. The
-- view's own WHERE clause and column list are the boundary.
--
-- Columns:
--   application_wording  what the application asks for, in the Court's words,
--                        cut from its filing entry: "Application (26A476) for a
--                        stay, submitted to The Chief Justice." → "for a stay".
--   lower_court, lower_court_case_numbers  for search only (from the docket header).
--
-- Rollback:  drop view public.emergency_shadow_docket_public;

create view public.emergency_shadow_docket_public as
select
  e.docket_number,
  e.docket_url,
  e.title,
  e.application_type,
  regexp_replace(
    regexp_replace(e.application_text, '^Application \([^)]*\)\s*', ''),
    '(,\s*submitted to .*|\.)$', ''
  ) as application_wording,
  e.directed_to,
  e.filed_date,
  e.pending,
  e.outcome,
  a.lower_court,
  a.lower_court_case_numbers
from public.emergency_shadow_docket e
join public.application_details a using (docket_number)
where e.public_view;

revoke all on public.emergency_shadow_docket_public from public;
grant select on public.emergency_shadow_docket_public to anon, authenticated;
