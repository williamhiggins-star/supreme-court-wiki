-- Seed: people + judgeships for the nine sitting justices, per
-- SUPABASE_PLAN.md Phase 1.
--
-- Idempotent: safe to re-run (people upserts on `slug`; judgeships upserts
-- on the (person_id, court_id, start_date) unique constraint).
--
-- All dates below were checked against multiple independent public sources
-- during authoring (SCOTUS press releases/oath pages, Wikipedia, contemporary
-- news coverage) rather than recalled from memory alone; sources are noted
-- inline. `start_date` uses the date each justice actually began exercising
-- the office (constitutional + judicial oath both administered, or the
-- judicial oath specifically where the two were split across days) —
-- several justices were confirmed by the Senate on one date but didn't take
-- the oath(s) that start the judgeship until a few days later, noted below
-- where it applies.

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------

insert into public.people (slug, full_name, short_name, born, bio_summary) values
  ('john-roberts', 'John G. Roberts Jr.', 'Roberts', '1955-01-27',
    'Chief Justice of the United States since 2005; nominated by President George W. Bush.'),
  ('clarence-thomas', 'Clarence Thomas', 'Thomas', '1948-06-23',
    'Associate Justice since 1991; nominated by President George H. W. Bush.'),
  ('samuel-alito', 'Samuel A. Alito Jr.', 'Alito', '1950-04-01',
    'Associate Justice since 2006; nominated by President George W. Bush.'),
  ('sonia-sotomayor', 'Sonia Sotomayor', 'Sotomayor', '1954-06-25',
    'Associate Justice since 2009; nominated by President Barack Obama.'),
  ('elena-kagan', 'Elena Kagan', 'Kagan', '1960-04-28',
    'Associate Justice since 2010; nominated by President Barack Obama.'),
  ('neil-gorsuch', 'Neil M. Gorsuch', 'Gorsuch', '1967-08-29',
    'Associate Justice since 2017; nominated by President Donald Trump.'),
  ('brett-kavanaugh', 'Brett M. Kavanaugh', 'Kavanaugh', '1965-02-12',
    'Associate Justice since 2018; nominated by President Donald Trump.'),
  ('amy-coney-barrett', 'Amy Coney Barrett', 'Barrett', '1972-01-28',
    'Associate Justice since 2020; nominated by President Donald Trump.'),
  ('ketanji-brown-jackson', 'Ketanji Brown Jackson', 'Jackson', '1970-09-14',
    'Associate Justice since 2022; nominated by President Joe Biden.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- judgeships (all on 'scotus')
-- ---------------------------------------------------------------------------

insert into public.judgeships (person_id, court_id, title, is_chief, appointed_by, start_date, end_date)
select p.id, c.id, v.title, v.is_chief, v.appointed_by, v.start_date::date, null
from (values
  -- Sworn in (constitutional + judicial oath) 2005-09-29, the day of Senate
  -- confirmation. Source: supremecourt.gov / widely reported same-day.
  ('john-roberts', 'Chief Justice', true, 'George W. Bush', '2005-09-29'),

  -- Confirmed 1991-10-15; took the judicial oath privately on 1991-10-23
  -- (re-administered at a public ceremony 1991-11-01, not the operative
  -- date). Source: Washington Post archive (1991-10-24), Deseret News
  -- (1991-10-23), Supreme Court Historical Society Quarterly 1991 vol. 4.
  ('clarence-thomas', 'Associate Justice', false, 'George H. W. Bush', '1991-10-23'),

  -- Confirmed and sworn in 2006-01-31. Source: contemporaneous reporting,
  -- supremecourt.gov.
  ('samuel-alito', 'Associate Justice', false, 'George W. Bush', '2006-01-31'),

  -- Sworn in 2009-08-08 (confirmed 2009-08-06). Source: supremecourt.gov.
  ('sonia-sotomayor', 'Associate Justice', false, 'Barack Obama', '2009-08-08'),

  -- Sworn in 2010-08-07 (confirmed 2010-08-05). Source: supremecourt.gov.
  ('elena-kagan', 'Associate Justice', false, 'Barack Obama', '2010-08-07'),

  -- Sworn in 2017-04-10 (confirmed 2017-04-07). Source: supremecourt.gov.
  ('neil-gorsuch', 'Associate Justice', false, 'Donald Trump', '2017-04-10'),

  -- Both oaths administered 2018-10-06, the day of confirmation, so he
  -- could begin participating immediately. Source: supremecourt.gov press
  -- release pr_10-06-18.
  ('brett-kavanaugh', 'Associate Justice', false, 'Donald Trump', '2018-10-06'),

  -- Confirmed / took the constitutional oath 2020-10-26; the judicial oath
  -- (the one that actually starts service) was administered 2020-10-27.
  -- Source: supremecourt.gov oath ceremony page (oath_barrett.aspx).
  ('amy-coney-barrett', 'Associate Justice', false, 'Donald Trump', '2020-10-27'),

  -- Confirmed 2022-04-07; did not take the oath / join the Court until
  -- Justice Breyer's retirement took effect, 2022-06-30. Source: SCOTUSblog
  -- (2022-04-07 confirmation), CNBC (2022-06-30 swearing-in).
  ('ketanji-brown-jackson', 'Associate Justice', false, 'Joe Biden', '2022-06-30')
) as v(person_slug, title, is_chief, appointed_by, start_date)
join public.people p on p.slug = v.person_slug
cross join (select id from public.courts where slug = 'scotus') c
on conflict (person_id, court_id, start_date) do nothing;
