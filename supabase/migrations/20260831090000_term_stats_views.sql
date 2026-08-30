-- Term stats read layer — read-only SQL views computing every statistic
-- in the SCOTUSblog term Stat Pack, per docs/term-stats-coding-rules.md.
--
-- Views, not a single get_term_stats(term) RPC. Reasoning:
--   1. Every other piece of business logic in this schema (Phase 1-6) is
--      plain SQL objects — tables + one trivial trigger function
--      (set_updated_at). There is no precedent anywhere in this repo's
--      migrations for PL/pgSQL business logic; a single big JSON-building
--      RPC would be the first of its kind and the hardest to review.
--   2. The Stat Pack has ~13 independent stats. Views let each be
--      queried, EXPLAINed, and unit-tested on its own — exactly what
--      Step 2's Feldman comparison needs (one query per published
--      number). One RPC returning a nested JSON blob couples all of them
--      into a single function where a bug in one stat's computation can
--      break the whole payload, and isolating which sub-computation is
--      wrong means unpacking JSON instead of just querying the view.
--   3. Consumers of this read layer are pipeline scripts (this repo's
--      own convention — the public site never queries Supabase; see
--      CLAUDE.md), not a page doing one request per render. N small
--      server-side queries from a script is not a real cost here the
--      way it would be from a browser.
--   4. Every view still gets exposed through PostgREST automatically
--      (same as the tables), so nothing is lost versus an RPC for a
--      future API consumer — it's just N endpoints instead of one.
--
-- All views use `security_invoker = true` so they run with the QUERYING
-- role's own RLS, not the view owner's — the same "public read access"
-- effect the table policies already establish, applied correctly to
-- views (the Postgres 15+/17 pattern; superuser-defined views default to
-- bypassing RLS otherwise, which would be wrong here).
--
-- Every stat is documented in docs/term-stats-coding-rules.md; view
-- names below are cross-referenced to the section that defines them.
-- Two stats (the voting-alignment grid buckets, and what "term index by
-- sitting" means) weren't part of last session's 11 rules — their
-- definitions are added to the coding-rules doc as §12/§13 alongside
-- this migration, not invented silently here.

-- ---------------------------------------------------------------------------
-- Base views — every other view in this file builds on these two, so the
-- side/split logic exists in exactly one place (coding-rules.md §0/§1/§3).
-- ---------------------------------------------------------------------------

-- One row per (case, participating justice), with the majority/dissent
-- side bucket from §0. Excludes recused/did_not_participate entirely —
-- "participating" is the whole point of this view.
create view public.term_stats_case_sides
with (security_invoker = true) as
select
  d.case_id,
  d.person_id,
  d.position,
  case
    when d.position in ('majority', 'plurality', 'concurrence') then 'majority'
    when d.position in ('concur_dissent', 'dissent') then 'dissent'
  end as side
from public.decisions d
where d.position not in ('recused', 'did_not_participate');

comment on view public.term_stats_case_sides is
  'Base view: participating justices per case, bucketed majority/dissent per coding-rules.md §0.';

-- One row per decided case: majority/dissent head count, unanimous
-- (§1), closely divided (§3).
create view public.term_stats_case_splits
with (security_invoker = true) as
select
  c.id as case_id,
  c.term,
  c.slug,
  c.caption,
  count(*) filter (where cs.side = 'majority') as majority_count,
  count(*) filter (where cs.side = 'dissent') as dissent_count,
  -- §1: "no full dissent" — only position = 'dissent' disqualifies.
  -- concur_dissent does NOT break unanimity under this reading; see the
  -- open question flagged in §1.
  count(*) filter (where cs.position = 'dissent') = 0 as is_unanimous,
  (count(*) filter (where cs.side = 'majority'), count(*) filter (where cs.side = 'dissent'))
    in ((5, 4), (5, 3), (6, 3), (6, 2)) as is_closely_divided
from public.cases c
join public.term_stats_case_sides cs on cs.case_id = c.id
where c.status = 'decided'
group by c.id, c.term, c.slug, c.caption;

comment on view public.term_stats_case_splits is
  'Base view: one row per decided case with majority/dissent counts, unanimous and closely-divided flags per coding-rules.md §1/§3.';

-- Cases (id + term) that are ideologically split per §4: majority-side
-- set exactly equals the conservative bloc, dissent-side exactly equals
-- the liberal bloc, for justices who participated in THIS case.
create view public.term_stats_ideological_splits
with (security_invoker = true) as
select cspl.case_id, cspl.term
from public.term_stats_case_splits cspl
where cspl.majority_count > 0
  and cspl.dissent_count > 0
  and (cspl.majority_count + cspl.dissent_count) = (
    select count(*)
    from public.term_stats_case_sides s
    join public.justice_term_blocs jtb
      on jtb.person_id = s.person_id and jtb.term = cspl.term
    where s.case_id = cspl.case_id
      and ((s.side = 'majority' and jtb.bloc = 'conservative')
        or (s.side = 'dissent' and jtb.bloc = 'liberal'))
  );

comment on view public.term_stats_ideological_splits is
  'Cases where the majority/dissent sides exactly match the conservative/liberal bloc for that term — coding-rules.md §4. Every participant must have a matching justice_term_blocs row or the case is excluded.';

-- ---------------------------------------------------------------------------
-- 1. Opinions issued per term by type
-- ---------------------------------------------------------------------------

create view public.term_stats_opinions_by_type
with (security_invoker = true) as
select c.term, o.kind, count(*) as opinion_count
from public.opinions o
join public.cases c on c.id = o.case_id
where c.status = 'decided'
group by c.term, o.kind;

-- ---------------------------------------------------------------------------
-- 2. Unanimity rate per term (§1)
-- ---------------------------------------------------------------------------

create view public.term_stats_unanimity_rate
with (security_invoker = true) as
select
  term,
  count(*) as decided_cases,
  count(*) filter (where is_unanimous) as unanimous_cases,
  round(100.0 * count(*) filter (where is_unanimous) / nullif(count(*), 0), 1) as unanimous_pct
from public.term_stats_case_splits
group by term;

-- ---------------------------------------------------------------------------
-- 3. Frequency-in-majority per justice — all cases / non-unanimous /
--    closely-divided (§7)
-- ---------------------------------------------------------------------------

create view public.term_stats_majority_frequency
with (security_invoker = true) as
select
  cspl.term,
  s.person_id,
  count(*) as cases_participated,
  count(*) filter (where s.side = 'majority') as majority_cases,
  round(100.0 * count(*) filter (where s.side = 'majority') / nullif(count(*), 0), 1) as majority_pct,
  count(*) filter (where not cspl.is_unanimous) as cases_participated_non_unanimous,
  round(100.0 * count(*) filter (where not cspl.is_unanimous and s.side = 'majority')
    / nullif(count(*) filter (where not cspl.is_unanimous), 0), 1) as majority_pct_non_unanimous,
  count(*) filter (where cspl.is_closely_divided) as cases_participated_closely_divided,
  round(100.0 * count(*) filter (where cspl.is_closely_divided and s.side = 'majority')
    / nullif(count(*) filter (where cspl.is_closely_divided), 0), 1) as majority_pct_closely_divided
from public.term_stats_case_sides s
join public.term_stats_case_splits cspl on cspl.case_id = s.case_id
group by cspl.term, s.person_id;

comment on view public.term_stats_majority_frequency is
  'Per-justice majority frequency, all/non-unanimous/closely-divided variants. Denominator caveat: coding-rules.md §7 — recusal is not yet written anywhere, so "cases_participated" over-counts until that pipeline gap is fixed.';

-- ---------------------------------------------------------------------------
-- 4. Justice agreement matrix — all cases / closely-divided (§5)
-- ---------------------------------------------------------------------------

create view public.term_stats_agreement
with (security_invoker = true) as
select
  cspl.term,
  a.person_id as person_id_1,
  b.person_id as person_id_2,
  count(*) as cases_both_participated,
  count(*) filter (where a.side = b.side) as cases_agreed,
  round(100.0 * count(*) filter (where a.side = b.side) / nullif(count(*), 0), 1) as agreement_pct,
  count(*) filter (where cspl.is_closely_divided) as cases_both_participated_closely_divided,
  count(*) filter (where cspl.is_closely_divided and a.side = b.side) as cases_agreed_closely_divided,
  round(100.0 * count(*) filter (where cspl.is_closely_divided and a.side = b.side)
    / nullif(count(*) filter (where cspl.is_closely_divided), 0), 1) as agreement_pct_closely_divided
from public.term_stats_case_sides a
join public.term_stats_case_sides b on b.case_id = a.case_id and b.person_id > a.person_id
join public.term_stats_case_splits cspl on cspl.case_id = a.case_id
group by cspl.term, a.person_id, b.person_id;

comment on view public.term_stats_agreement is
  'Pairwise justice agreement (same side bucket), all cases and closely-divided-only — coding-rules.md §5. One row per unordered pair per term (person_id_1 < person_id_2).';

-- ---------------------------------------------------------------------------
-- 5. Vote-split distribution — all cases / ideologically-split-only (§6)
-- ---------------------------------------------------------------------------

create view public.term_stats_vote_split_distribution
with (security_invoker = true) as
select
  cspl.term,
  cspl.majority_count,
  cspl.dissent_count,
  cspl.majority_count || '-' || cspl.dissent_count as split_label,
  count(*) as case_count,
  count(*) filter (where isp.case_id is not null) as ideologically_split_case_count
from public.term_stats_case_splits cspl
left join public.term_stats_ideological_splits isp on isp.case_id = cspl.case_id
group by cspl.term, cspl.majority_count, cspl.dissent_count;

-- ---------------------------------------------------------------------------
-- 6. Ideologically-split-case rate per term (§4)
-- ---------------------------------------------------------------------------

create view public.term_stats_ideological_split_rate
with (security_invoker = true) as
select
  cspl.term,
  count(*) as decided_cases,
  count(distinct isp.case_id) as ideologically_split_cases,
  round(100.0 * count(distinct isp.case_id) / nullif(count(*), 0), 1) as ideologically_split_pct
from public.term_stats_case_splits cspl
left join public.term_stats_ideological_splits isp on isp.case_id = cspl.case_id
group by cspl.term;

-- ---------------------------------------------------------------------------
-- 7. Closely-divided case list with dissenting bloc (§3)
-- ---------------------------------------------------------------------------

create view public.term_stats_closely_divided_cases
with (security_invoker = true) as
select
  cspl.case_id,
  cspl.slug,
  cspl.caption,
  cspl.term,
  cspl.majority_count,
  cspl.dissent_count,
  (
    select jsonb_agg(jsonb_build_object(
      'person_id', s.person_id, 'slug', p.slug, 'name', p.full_name, 'bloc', jtb.bloc
    ) order by p.full_name)
    from public.term_stats_case_sides s
    join public.people p on p.id = s.person_id
    left join public.justice_term_blocs jtb on jtb.person_id = s.person_id and jtb.term = cspl.term
    where s.case_id = cspl.case_id and s.side = 'dissent'
  ) as dissenting_justices
from public.term_stats_case_splits cspl
where cspl.is_closely_divided;

-- ---------------------------------------------------------------------------
-- 8. Circuit scorecard — affirm/reverse by lower court, one row per
--    consolidated sub-docket (§8)
-- ---------------------------------------------------------------------------

-- Detail: one row per (case, lower court, docket) — the actual
-- "one row per consolidated sub-docket" granularity §8 requires.
create view public.term_stats_circuit_scorecard_detail
with (security_invoker = true) as
select
  clc.id as case_lower_court_id,
  c.term,
  co.id as court_id,
  co.slug as court_slug,
  co.name as court_name,
  clc.docket_number,
  c.id as case_id,
  c.slug as case_slug,
  c.caption,
  c.disposition
from public.case_lower_courts clc
join public.cases c on c.id = clc.case_id
join public.courts co on co.id = clc.court_id
where c.status = 'decided';

-- Summary: affirm/reverse/vacate counts per lower court per term, built
-- from the detail view above (not from cases directly), so a
-- consolidated case contributes to every circuit it touches.
create view public.term_stats_circuit_scorecard
with (security_invoker = true) as
select
  term,
  court_id,
  court_slug,
  court_name,
  count(*) as cases_decided,
  count(*) filter (where disposition = 'affirmed') as affirmed,
  count(*) filter (where disposition in ('reversed', 'reversed_and_remanded')) as reversed,
  count(*) filter (where disposition in ('vacated', 'vacated_and_remanded')) as vacated,
  count(*) filter (where disposition = 'affirmed_in_part_and_reversed_in_part') as affirmed_in_part,
  count(*) filter (where disposition is null
    or disposition not in ('affirmed', 'reversed', 'reversed_and_remanded',
      'vacated', 'vacated_and_remanded', 'affirmed_in_part_and_reversed_in_part')) as other_or_no_disposition
from public.term_stats_circuit_scorecard_detail
group by term, court_id, court_slug, court_name;

comment on view public.term_stats_circuit_scorecard is
  'Coding-rules.md §8: disposition is scoped to the whole case, not per lower court — a consolidated case that split differently across circuits cannot be represented, per that section''s flagged assumption.';

-- ---------------------------------------------------------------------------
-- 9. Opinions authored per justice, by type (§10)
-- ---------------------------------------------------------------------------

-- Raw, unbucketed — one row per (term, author, kind).
-- §10a (Session 7): an author can have multiple opinions rows for the
-- same case — a fractured opinion split into distinct parts commanding
-- different coalitions (e.g. majority as to most Parts, plurality-only
-- as to one or two others). Confirmed twice in this dataset: Learning
-- Resources v. Trump/Roberts and Barrett v. United States/Jackson, both
-- majority+plurality for the same author. Feldman's own "Opinions
-- Authored by Each Justice" table counts these as ONE opinion each,
-- under Majority only (verified directly against the rendered PDF) — so
-- both authorship views below dedupe to one row per (case_id,
-- author_id), keeping the higher-priority kind, before counting.
--
-- Priority order: majority > plurality is EMPIRICALLY VERIFIED (2/2 real
-- instances, both cross-checked against Feldman's table). Everything
-- after plurality in the CASE expression below is an UNVERIFIED,
-- provisional best-guess ordering — no case in this dataset currently
-- exercises any pairing past majority/plurality, so treat the rest as a
-- placeholder to revisit once one does, not a confirmed fact.
--
-- This dedup applies ONLY to these two authorship-count views. Every
-- other view (word counts, decision_ties, voting-alignment) still reads
-- every opinions row individually — deduping there would silently drop
-- real fragment-level detail (who joined which specific Part).

create view public.term_stats_opinions_authored
with (security_invoker = true) as
with ranked as (
  select
    c.term, o.case_id, o.author_id, o.kind,
    row_number() over (
      partition by o.case_id, o.author_id
      order by case o.kind
        when 'majority' then 1
        when 'plurality' then 2
        when 'per_curiam' then 3
        when 'concur_dissent' then 4
        when 'concurrence' then 5
        when 'concurrence_in_judgment' then 6
        when 'concurrence_in_part' then 7
        when 'dissent' then 8
        when 'dissent_in_part' then 9
        else 99
      end
    ) as rn
  from public.opinions o
  join public.cases c on c.id = o.case_id
  where c.status = 'decided' and o.author_id is not null
)
select term, author_id as person_id, kind, count(*) as opinion_count
from ranked
where rn = 1
group by term, author_id, kind;

-- Bucketed per §10's proposed convention — for direct comparison
-- against Stat-Pack-style "total opinions / concurrences / dissents"
-- figures. Flagged in §10 as a proposed convention, not a confirmed one.
-- Built on the same case_id/author_id dedup as term_stats_opinions_authored
-- above (see that view's comment) rather than a second, independent
-- implementation of the same rule.
create view public.term_stats_opinions_authored_summary
with (security_invoker = true) as
with ranked as (
  select
    c.term, o.case_id, o.author_id, o.kind,
    row_number() over (
      partition by o.case_id, o.author_id
      order by case o.kind
        when 'majority' then 1
        when 'plurality' then 2
        when 'per_curiam' then 3
        when 'concur_dissent' then 4
        when 'concurrence' then 5
        when 'concurrence_in_judgment' then 6
        when 'concurrence_in_part' then 7
        when 'dissent' then 8
        when 'dissent_in_part' then 9
        else 99
      end
    ) as rn
  from public.opinions o
  join public.cases c on c.id = o.case_id
  where c.status = 'decided' and o.author_id is not null
)
select
  term,
  author_id as person_id,
  count(*) as total_opinions,
  count(*) filter (where kind = 'majority') as majority_opinions,
  count(*) filter (where kind = 'plurality') as plurality_opinions,
  count(*) filter (where kind in ('concurrence', 'concurrence_in_judgment', 'concurrence_in_part')) as concurrences,
  count(*) filter (where kind in ('dissent', 'dissent_in_part')) as dissents,
  count(*) filter (where kind = 'concur_dissent') as concur_dissents
from ranked
where rn = 1
group by term, author_id;

-- ---------------------------------------------------------------------------
-- 10. Days between argument and decision — per case, per justice-as-
--     majority-author; longest/shortest are ORDER BY on these (§9)
-- ---------------------------------------------------------------------------

create view public.term_stats_days_to_decision
with (security_invoker = true) as
select
  c.id as case_id, c.slug, c.caption, c.term, c.argued_date, c.decided_date,
  (c.decided_date - c.argued_date) as days_to_decision
from public.cases c
where c.status = 'decided' and c.argued_date is not null and c.decided_date is not null;

create view public.term_stats_days_to_decision_by_author
with (security_invoker = true) as
select
  c.term,
  o.author_id as person_id,
  count(*) as majority_opinions_authored,
  round(avg(c.decided_date - c.argued_date), 2) as avg_days_to_decision,
  min(c.decided_date - c.argued_date) as min_days,
  max(c.decided_date - c.argued_date) as max_days
from public.opinions o
join public.cases c on c.id = o.case_id
where o.kind = 'majority'
  and c.status = 'decided'
  and c.argued_date is not null
  and c.decided_date is not null
  and o.author_id is not null
group by c.term, o.author_id;

comment on view public.term_stats_days_to_decision_by_author is
  'Per-justice average/min/max days from argument to decision, scoped to opinions they authored as the MAJORITY author — coding-rules.md §9.';

-- ---------------------------------------------------------------------------
-- 11. Opinion word counts — per-justice average, per-type-over-time,
--     individual extremes, per-case combined (word_count column, added
--     in the previous migration but not yet populated by any parser)
-- ---------------------------------------------------------------------------

create view public.term_stats_word_counts_by_author
with (security_invoker = true) as
select
  c.term, o.author_id as person_id, o.kind,
  count(*) as opinions_written,
  round(avg(o.word_count), 0) as avg_word_count,
  min(o.word_count) as min_word_count,
  max(o.word_count) as max_word_count
from public.opinions o
join public.cases c on c.id = o.case_id
where c.status = 'decided' and o.author_id is not null and o.word_count is not null
group by c.term, o.author_id, o.kind;

create view public.term_stats_word_counts_by_type_over_time
with (security_invoker = true) as
select
  c.term, o.kind,
  count(*) as opinions_written,
  round(avg(o.word_count), 0) as avg_word_count
from public.opinions o
join public.cases c on c.id = o.case_id
where c.status = 'decided' and o.word_count is not null
group by c.term, o.kind;

-- Individual opinions with word counts — consumer does ORDER BY
-- word_count ASC/DESC LIMIT N for shortest/longest.
create view public.term_stats_opinion_word_count_extremes
with (security_invoker = true) as
select
  o.id as opinion_id, c.term, c.slug as case_slug, c.caption, o.kind,
  o.author_id as person_id, p.full_name as author_name, o.word_count
from public.opinions o
join public.cases c on c.id = o.case_id
left join public.people p on p.id = o.author_id
where c.status = 'decided' and o.word_count is not null;

-- Combined word count per case (every opinion filed in that case) —
-- consumer does ORDER BY combined_word_count DESC LIMIT N for longest.
create view public.term_stats_case_combined_word_counts
with (security_invoker = true) as
select
  c.id as case_id, c.slug, c.caption, c.term,
  sum(o.word_count) as combined_word_count,
  count(*) filter (where o.word_count is not null) as opinions_with_word_count,
  count(*) as total_opinions
from public.cases c
join public.opinions o on o.case_id = c.id
where c.status = 'decided'
group by c.id, c.slug, c.caption, c.term;

-- ---------------------------------------------------------------------------
-- 12. Per-case voting alignment grid
--
-- Not one of last session's §1-§11 rules — added here; the bucketing
-- below is this migration's own proposed reading of the 4 requested
-- categories, and is now documented as coding-rules.md §12. It is a
-- DISPLAY grouping, deliberately different granularity from the
-- majority-side/dissent-side split used everywhere else in this file:
--   - majority: full agreement with the result (majority/plurality
--     author or joiner, OR a full concurrence/concurrence-in-judgment —
--     both are 100% agreement with the outcome even via separate
--     reasoning).
--   - partial_concurrence: qualified agreement — concurring in only
--     part of the judgment, or the mixed concur/dissent opinion.
--   - dissent: full dissent only.
--   - did_not_participate: recused or did not participate.
-- ---------------------------------------------------------------------------

create view public.term_stats_voting_alignment_grid
with (security_invoker = true) as
select
  c.id as case_id, c.slug, c.caption, c.term,
  p.id as person_id, p.slug as justice_slug, p.full_name,
  d.position,
  case
    when d.position in ('majority', 'plurality', 'concurrence') then 'majority'
    when d.position = 'concur_dissent' then 'partial_concurrence'
    when d.position = 'dissent' then 'dissent'
    when d.position in ('recused', 'did_not_participate') then 'did_not_participate'
  end as grid_cell
from public.decisions d
join public.cases c on c.id = d.case_id
join public.people p on p.id = d.person_id
where c.status = 'decided';

comment on view public.term_stats_voting_alignment_grid is
  'Per-case, per-justice voting grid with a 4-category display bucket — coding-rules.md §12. Note: with concurrence_in_part/dissent_in_part not split out at the position layer (design decision #3), a concurrence-in-part author is indistinguishable here from a full concurrence (both land in "majority", not "partial_concurrence") until that position-layer limitation is revisited.';

-- ---------------------------------------------------------------------------
-- 13. Term index by sitting
--
-- Also not one of last session's rules — this migration's reading
-- ("index" = counts of cases per term grouped by argument sitting),
-- documented as coding-rules.md §13.
-- ---------------------------------------------------------------------------

create view public.term_stats_sitting_index
with (security_invoker = true) as
select
  term,
  sitting,
  count(*) as cases_count,
  count(*) filter (where status = 'decided') as decided_count
from public.cases
where sitting is not null
group by term, sitting;

-- ---------------------------------------------------------------------------
-- Vote-side-derivation cross-check (§11) — a flag/warning field, never a
-- silent substitute for decisions.position and never overwritten by it.
-- ---------------------------------------------------------------------------

create view public.term_stats_vote_side_cross_check
with (security_invoker = true) as
with tie_side as (
  select
    dt.case_id,
    dt.person_id,
    -- A person can have multiple decision_ties rows in one case (author
    -- of a concurrence AND a named joiner elsewhere); a dissent-side tie
    -- always wins the derivation, mirroring decisionSides.ts's own
    -- priority order (dissent-side is never silently outvoted by a
    -- majority-side tie for the same person/case).
    bool_or(o.kind in ('concur_dissent', 'dissent_in_part', 'dissent')) as has_dissent_tie,
    bool_or(o.kind in ('majority', 'plurality', 'concurrence', 'concurrence_in_judgment', 'concurrence_in_part')) as has_majority_tie
  from public.decision_ties dt
  join public.opinions o on o.id = dt.opinion_id
  group by dt.case_id, dt.person_id
)
select
  s.case_id,
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
left join tie_side ts on ts.case_id = s.case_id and ts.person_id = s.person_id;

comment on view public.term_stats_vote_side_cross_check is
  'Coding-rules.md §11: compares decision_ties/opinions.kind-derived side against the stored decisions.position for every participating justice. check_status is match / mismatch / unverifiable_no_decision_ties_row — the third is expected to dominate today for "silent majority" justices, per §11''s documented pipeline gap. Never used to overwrite decisions; surfaced as-is for review.';

-- ---------------------------------------------------------------------------
-- Grants — same "public read access" treatment as every table so far.
-- Views don't take RLS policies directly (security_invoker above makes
-- them respect the underlying tables' policies instead); they still need
-- their own SELECT grant.
-- ---------------------------------------------------------------------------

grant select on
  public.term_stats_case_sides, public.term_stats_case_splits, public.term_stats_ideological_splits,
  public.term_stats_opinions_by_type, public.term_stats_unanimity_rate, public.term_stats_majority_frequency,
  public.term_stats_agreement, public.term_stats_vote_split_distribution, public.term_stats_ideological_split_rate,
  public.term_stats_closely_divided_cases, public.term_stats_circuit_scorecard_detail, public.term_stats_circuit_scorecard,
  public.term_stats_opinions_authored, public.term_stats_opinions_authored_summary,
  public.term_stats_days_to_decision, public.term_stats_days_to_decision_by_author,
  public.term_stats_word_counts_by_author, public.term_stats_word_counts_by_type_over_time,
  public.term_stats_opinion_word_count_extremes, public.term_stats_case_combined_word_counts,
  public.term_stats_voting_alignment_grid, public.term_stats_sitting_index, public.term_stats_vote_side_cross_check
to anon, authenticated;
