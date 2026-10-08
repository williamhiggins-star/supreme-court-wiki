-- The oral-argument calendar PDFs SCOTUS publishes
-- (argument_calendars/MonthlyArgumentCal<Month><Year>.pdf) state a single
-- "Court Convenes at 10 a.m." time per monthly session, applying to every
-- argument day in it (there's no per-case AM/PM session split in the
-- current calendar format -- confirmed against the live OT2026 PDFs,
-- where even two-case days carry only one convene time). A plain text
-- column rather than a `time`/`timestamptz` column: the value is always
-- an already-formatted "10:00 AM ET"-style string, not a value ever used
-- in a date computation, and text avoids baking in a timezone-conversion
-- assumption the source data doesn't actually carry.

alter table public.cases add column argued_time text;
