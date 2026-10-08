-- One cases row per docket per court.
--
-- The daily pipeline matches cases by slug, and a case's slug could change
-- between runs (it used to be built from the LLM's summary title), which
-- could leave two rows for the same docket. The pipeline now looks cases up
-- by exact docket number and keeps the existing slug; this index makes the
-- database refuse a second row for the same docket regardless.
--
-- Stub rows (precedents, lower-court cases) and historic rows are excluded:
-- they are keyed by slug and are not part of this lifecycle. Checked first:
-- no duplicate (court_id, docket_number) pairs among the 116 rows that have
-- a docket number (2026-10-08).

create unique index if not exists cases_court_docket_number_key
  on public.cases (court_id, docket_number)
  where docket_number is not null
    and status not in ('stub', 'historic');
