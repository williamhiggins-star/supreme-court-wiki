-- Privileged (service role) hashes for the migration safeguards: every
-- term_stats_* view, the stats tables, opinions, decisions, docket
-- entries, every non-granted case, status counts and the granted count.
-- Run:  supabase db query --linked -f docs/migration-snapshot/privileged-hashes.sql
-- For a migration that rewrites rows on purpose (e.g. the status rename),
-- hash those rows with the change mapped back and updated_at dropped.
select string_agg(name || ':' || h, E'\n' order by name) as out from (
  select v.table_name as name,
    (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) as h from public.%I t', E'\n', '', v.table_name), false, true, '')))[1]::text as h
  from information_schema.views v where v.table_schema='public' and v.table_name like 'term_stats%'
  union all
  select t, (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) as h from public.%I t', E'\n', '', t), false, true, '')))[1]::text
  from unnest(array['term_opinion_stats','justice_stats','lawyer_stats','opinions','decisions','docket_entries']) t
  union all
  select 'cases_not_granted', (select md5(string_agg(t::text, E'\n' order by t::text)) from public.cases t where status <> 'granted')
  union all
  select 'status_counts_not_granted', (select string_agg(status||'='||n, ',' order by status) from (select status, count(*) n from public.cases where status <> 'granted' group by status) s)
  union all
  select 'granted_cases', (select count(*)::text from public.cases where status = 'granted')
) x;
