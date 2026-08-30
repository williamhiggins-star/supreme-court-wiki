-- advocate_id -> case_participations is not a reliable way to recover
-- which party (petitioner/respondent/amicus) a key exchange belongs to:
-- case_participations coverage is incomplete (confirmed: 59 of 96
-- (case, role) pairs among the OT2025 rows being backfilled have no
-- matching case_participations entry at all, including Trump v.
-- Slaughter's own respondent side). role is the direct, reliable signal
-- -- populated straight from the same JSON parties[].role match used for
-- context, not derived through advocate_id. advocate_id is kept too, but
-- only as best-effort supplementary metadata (who specifically asked/
-- argued, when case_participations happens to know), never load-bearing
-- for which section an exchange renders under.

alter table public.key_exchanges add column role text check (role in ('petitioner', 'respondent', 'amicus'));
