-- Persist each opinion's cleaned full text alongside its word_count -- both
-- come from the same slip-opinion extraction pass
-- (scripts/backfill-opinion-word-counts.ts); previously the cleaned text
-- was computed and then discarded, keeping only the count. opinions
-- already has RLS + a public-read policy + grant (20260828120600,
-- 20260828120700), so no new RLS/grant statement is needed for this column.

alter table public.opinions add column full_text text;
