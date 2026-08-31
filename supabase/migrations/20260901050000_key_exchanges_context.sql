-- data/cases/*.json's parties[].keyExchanges[] carries a `context` field
-- distinct from `significance` ("Justice Kagan pressed on whether..." vs.
-- "Revealed the government's difficulty in..."), but the original
-- dual-write folded both into key_exchanges.significance, losing the
-- distinction. Adding the column back; backfilling it is scoped to
-- OT2025 rows only (scripts/backfill-key-exchange-attribution.ts) -- older
-- terms' rows simply get context = null, same as they already have no
-- advocate_id.

alter table public.key_exchanges add column context text;
