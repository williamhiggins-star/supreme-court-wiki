-- Seed: courts — SCOTUS + all 13 federal circuits + the 50 state supreme
-- courts, per SUPABASE_PLAN.md Phase 1.
--
-- Idempotent: safe to re-run (upserts on the `slug` unique constraint).
--
-- Flags / scope decisions (none of these are guesses about a fact — they're
-- naming/coverage choices where "the state supreme court" is ambiguous):
--
--   * New York's court of last resort is the "Court of Appeals" — its trial
--     courts are confusingly named "Supreme Court". Seeded under its actual
--     name, not "New York Supreme Court".
--   * Maryland's high court was renamed from "Court of Appeals of Maryland"
--     to "Supreme Court of Maryland" effective 2022-12-14 (voter-approved
--     constitutional amendment, Nov 2022 election). Seeded under the
--     current name. Source: Maryland Courts press release, 2022-12-14
--     (https://www.courts.state.md.us/media/news/2022/pr20221214).
--   * Texas and Oklahoma each have two courts of last resort — a Supreme
--     Court for civil matters and a separate Court of Criminal Appeals for
--     criminal matters. Only the civil Supreme Court is seeded here (the
--     conventional "state supreme court"); the criminal courts of last
--     resort are not in this table.
--
-- circuit_ordinal convention (schema-internal, not a sourced fact): 1-11 for
-- the numbered circuits, 12 for D.C. Circuit, 13 for Federal Circuit.

insert into public.courts (slug, name, level, circuit_ordinal, state) values
  ('scotus', 'Supreme Court of the United States', 'scotus', null, null),

  ('first-circuit', 'First Circuit', 'federal_appellate', 1, null),
  ('second-circuit', 'Second Circuit', 'federal_appellate', 2, null),
  ('third-circuit', 'Third Circuit', 'federal_appellate', 3, null),
  ('fourth-circuit', 'Fourth Circuit', 'federal_appellate', 4, null),
  ('fifth-circuit', 'Fifth Circuit', 'federal_appellate', 5, null),
  ('sixth-circuit', 'Sixth Circuit', 'federal_appellate', 6, null),
  ('seventh-circuit', 'Seventh Circuit', 'federal_appellate', 7, null),
  ('eighth-circuit', 'Eighth Circuit', 'federal_appellate', 8, null),
  ('ninth-circuit', 'Ninth Circuit', 'federal_appellate', 9, null),
  ('tenth-circuit', 'Tenth Circuit', 'federal_appellate', 10, null),
  ('eleventh-circuit', 'Eleventh Circuit', 'federal_appellate', 11, null),
  ('dc-circuit', 'D.C. Circuit', 'federal_appellate', 12, null),
  ('federal-circuit', 'Federal Circuit', 'federal_appellate', 13, null),

  ('alabama-supreme-court', 'Supreme Court of Alabama', 'state_supreme', null, 'Alabama'),
  ('alaska-supreme-court', 'Alaska Supreme Court', 'state_supreme', null, 'Alaska'),
  ('arizona-supreme-court', 'Arizona Supreme Court', 'state_supreme', null, 'Arizona'),
  ('arkansas-supreme-court', 'Arkansas Supreme Court', 'state_supreme', null, 'Arkansas'),
  ('california-supreme-court', 'Supreme Court of California', 'state_supreme', null, 'California'),
  ('colorado-supreme-court', 'Colorado Supreme Court', 'state_supreme', null, 'Colorado'),
  ('connecticut-supreme-court', 'Connecticut Supreme Court', 'state_supreme', null, 'Connecticut'),
  ('delaware-supreme-court', 'Delaware Supreme Court', 'state_supreme', null, 'Delaware'),
  ('florida-supreme-court', 'Supreme Court of Florida', 'state_supreme', null, 'Florida'),
  ('georgia-supreme-court', 'Supreme Court of Georgia', 'state_supreme', null, 'Georgia'),
  ('hawaii-supreme-court', 'Hawaii Supreme Court', 'state_supreme', null, 'Hawaii'),
  ('idaho-supreme-court', 'Idaho Supreme Court', 'state_supreme', null, 'Idaho'),
  ('illinois-supreme-court', 'Illinois Supreme Court', 'state_supreme', null, 'Illinois'),
  ('indiana-supreme-court', 'Indiana Supreme Court', 'state_supreme', null, 'Indiana'),
  ('iowa-supreme-court', 'Iowa Supreme Court', 'state_supreme', null, 'Iowa'),
  ('kansas-supreme-court', 'Kansas Supreme Court', 'state_supreme', null, 'Kansas'),
  ('kentucky-supreme-court', 'Supreme Court of Kentucky', 'state_supreme', null, 'Kentucky'),
  ('louisiana-supreme-court', 'Supreme Court of Louisiana', 'state_supreme', null, 'Louisiana'),
  ('maine-supreme-judicial-court', 'Maine Supreme Judicial Court', 'state_supreme', null, 'Maine'),
  ('maryland-supreme-court', 'Supreme Court of Maryland', 'state_supreme', null, 'Maryland'),
  ('massachusetts-supreme-judicial-court', 'Massachusetts Supreme Judicial Court', 'state_supreme', null, 'Massachusetts'),
  ('michigan-supreme-court', 'Michigan Supreme Court', 'state_supreme', null, 'Michigan'),
  ('minnesota-supreme-court', 'Minnesota Supreme Court', 'state_supreme', null, 'Minnesota'),
  ('mississippi-supreme-court', 'Mississippi Supreme Court', 'state_supreme', null, 'Mississippi'),
  ('missouri-supreme-court', 'Supreme Court of Missouri', 'state_supreme', null, 'Missouri'),
  ('montana-supreme-court', 'Montana Supreme Court', 'state_supreme', null, 'Montana'),
  ('nebraska-supreme-court', 'Nebraska Supreme Court', 'state_supreme', null, 'Nebraska'),
  ('nevada-supreme-court', 'Nevada Supreme Court', 'state_supreme', null, 'Nevada'),
  ('new-hampshire-supreme-court', 'New Hampshire Supreme Court', 'state_supreme', null, 'New Hampshire'),
  ('new-jersey-supreme-court', 'Supreme Court of New Jersey', 'state_supreme', null, 'New Jersey'),
  ('new-mexico-supreme-court', 'New Mexico Supreme Court', 'state_supreme', null, 'New Mexico'),
  ('new-york-court-of-appeals', 'New York Court of Appeals', 'state_supreme', null, 'New York'),
  ('north-carolina-supreme-court', 'Supreme Court of North Carolina', 'state_supreme', null, 'North Carolina'),
  ('north-dakota-supreme-court', 'North Dakota Supreme Court', 'state_supreme', null, 'North Dakota'),
  ('ohio-supreme-court', 'Supreme Court of Ohio', 'state_supreme', null, 'Ohio'),
  ('oklahoma-supreme-court', 'Oklahoma Supreme Court', 'state_supreme', null, 'Oklahoma'),
  ('oregon-supreme-court', 'Oregon Supreme Court', 'state_supreme', null, 'Oregon'),
  ('pennsylvania-supreme-court', 'Supreme Court of Pennsylvania', 'state_supreme', null, 'Pennsylvania'),
  ('rhode-island-supreme-court', 'Rhode Island Supreme Court', 'state_supreme', null, 'Rhode Island'),
  ('south-carolina-supreme-court', 'Supreme Court of South Carolina', 'state_supreme', null, 'South Carolina'),
  ('south-dakota-supreme-court', 'South Dakota Supreme Court', 'state_supreme', null, 'South Dakota'),
  ('tennessee-supreme-court', 'Tennessee Supreme Court', 'state_supreme', null, 'Tennessee'),
  ('texas-supreme-court', 'Supreme Court of Texas', 'state_supreme', null, 'Texas'),
  ('utah-supreme-court', 'Utah Supreme Court', 'state_supreme', null, 'Utah'),
  ('vermont-supreme-court', 'Vermont Supreme Court', 'state_supreme', null, 'Vermont'),
  ('virginia-supreme-court', 'Supreme Court of Virginia', 'state_supreme', null, 'Virginia'),
  ('washington-supreme-court', 'Washington Supreme Court', 'state_supreme', null, 'Washington'),
  ('west-virginia-supreme-court-of-appeals', 'Supreme Court of Appeals of West Virginia', 'state_supreme', null, 'West Virginia'),
  ('wisconsin-supreme-court', 'Wisconsin Supreme Court', 'state_supreme', null, 'Wisconsin'),
  ('wyoming-supreme-court', 'Wyoming Supreme Court', 'state_supreme', null, 'Wyoming'),

  -- Added for the Phase 2 backfill: ybarra-v-spangard (208 P.2d 445) is
  -- actually a California Court of Appeal decision, not the California
  -- Supreme Court's later, more famous ruling in the same case (a
  -- different citation) — see migration 20260828120800_statutes.sql for
  -- the 'state_appellate' level this row needed added to the schema.
  ('california-court-of-appeal-second-appellate-district', 'California Court of Appeal, Second Appellate District', 'state_appellate', null, 'California')
on conflict (slug) do nothing;
