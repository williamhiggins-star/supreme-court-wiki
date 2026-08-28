# SCOTUS Dashboard — Supabase migration & institutional knowledge plan

Goal: replace flat-JSON-as-source-of-truth with a genuine relational Supabase
database, structured like DYSTL's — including an institutional-knowledge layer
that is read at generation time and updated post-publish — while keeping the
public site statically rendered and fast.

Written 2026-08-28, against the architecture in `ARCHITECTURE.md`.

---

## 0. Decisions to lock before any code

1. **Dedicated Supabase project for SD.** Today the pipeline mirrors into
   DYSTL's Supabase project (`scotus_*` tables). SD should get its own
   project so the two products aren't entangled — separate billing, separate
   auth, separate RLS, and DYSTL outages can't touch SD. Decide how DYSTL
   keeps getting SCOTUS data afterwards (see §6).
2. **Migrations live in the repo.** Use the Supabase CLI;
   `supabase/migrations/*.sql` is version-controlled like everything else.
   No clicking around the dashboard to change schema.
3. **Static render stays.** The frontend keeps `generateStaticParams` /
   build-time data fetching; only the data source changes from
   `fs.readFileSync` to Supabase queries. The daily cron ends by triggering
   a Vercel deploy hook so the site rebuilds after each data run.
4. **Versioning must be replaced, not lost.** Today every daily commit is a
   reviewable diff of what Claude wrote. Postgres doesn't give you that for
   free. A `revisions` table (trigger-based snapshots on content tables)
   restores the audit trail — required before the JSON files stop being
   canonical.

---

## 1. Schema

Principles: one table per real-world entity, not per current role;
junction tables for every many-to-many; FK constraints actually enforced so
Claude cannot commit a dangling reference; `jsonb` only for genuinely
unstructured payloads (dossier contents, key-exchange text), never for
relationships.

### 1.1 Reference tables

```sql
courts (
  id uuid pk, slug text unique,
  name text,                      -- "Supreme Court of the United States", "Ninth Circuit", "Texas Supreme Court"
  level text check (level in ('scotus','federal_appellate','state_supreme')),
  circuit_ordinal int,            -- 1..11, plus DC and Federal, null for others
  state text                      -- null unless state_supreme
)

people (
  id uuid pk, slug text unique,
  full_name text, short_name text,
  born date, died date,
  bio_summary text
)

judgeships (                      -- a person's seat on a court, with history
  id uuid pk,
  person_id uuid fk -> people,
  court_id uuid fk -> courts,
  title text,                     -- "Associate Justice", "Chief Judge"
  is_chief bool default false,
  appointed_by text,
  start_date date, end_date date  -- end_date null = sitting
)

organizations (                   -- firms, SG's office, amici filers, publishers
  id uuid pk, slug text unique,
  name text,
  kind text check (kind in ('law_firm','government','nonprofit','trade_assoc',
                            'state_ag','academic','publisher','other'))
)

affiliations (
  person_id uuid fk -> people,
  org_id uuid fk -> organizations,
  role text, start_date date, end_date date
)
```

One `people` table, deliberately. Justices, appellate judges, state judges,
and advocates are roles, not species — Kavanaugh, Jackson, and Barrett all
have two `judgeships` rows; Paul Clement is a `people` row whose
participations are all advocacy. "Who is this person" is answered once;
"what have they been" is answered by joins.

### 1.2 Cases and decisions

```sql
cases (
  id uuid pk, slug text unique,
  court_id uuid fk -> courts,
  docket_number text,
  caption text,                   -- "Hamm v. Smith"
  term text,                      -- "OT2025", or year for lower courts
  status text check (status in ('petition','upcoming','argued','decided','historic','stub')),
  question_presented text,
  background text,
  significance text,
  argued_date date, decided_date date,
  vote_line text,                 -- "6-3"
  source_urls jsonb,
  is_stub bool default false      -- lightweight precedent stub awaiting enrichment
)

opinions (
  id uuid pk,
  case_id uuid fk -> cases,
  kind text check (kind in ('majority','plurality','per_curiam',
                            'concurrence','concurrence_in_judgment','dissent')),
  author_id uuid fk -> people,
  summary text,
  full_text_url text
)

opinion_joins (opinion_id fk, person_id fk)         -- who joined which opinion
votes         (case_id fk, person_id fk, side text) -- majority / dissent / recused

case_participations (              -- advocates and parties
  case_id uuid fk -> cases,
  person_id uuid fk -> people,
  role text check (role in ('argued_petitioner','argued_respondent',
                            'counsel_of_record','on_brief')),
  party_name text
)

key_exchanges (
  id uuid pk, case_id fk -> cases,
  justice_id uuid fk -> people, advocate_id uuid fk -> people,
  exchange text, significance text
)

citations (                        -- the graph that connects everything
  citing_case_id uuid fk -> cases,
  cited_case_id  uuid fk -> cases,
  treatment text check (treatment in ('relied_on','distinguished',
                                      'questioned','overruled','cited')),
  context text,
  primary key (citing_case_id, cited_case_id)
)
```

Today's `data/precedents/*.json` becomes rows in `cases` with
`status='historic'` (or `is_stub=true` until enriched) plus `citations`
edges. Today's stub-creation side effect maps cleanly: when transcript
processing mentions an unknown precedent, insert a stub row + citation edge
— FK satisfied, enrichment queued.

### 1.3 Circuit splits and appellate impacts

```sql
circuit_splits (
  id uuid pk,
  question text,
  status text,                     -- open / cert_granted / resolved
  scotus_case_id uuid fk -> cases  -- null until cert granted
)
split_positions (
  split_id uuid fk -> circuit_splits,
  case_id uuid fk -> cases,        -- the circuit decision taking this side
  position text
)

appellate_impacts (
  case_id uuid fk -> cases,
  impact_area text,                -- securities / antitrust / labor / ip / arbitration / class_actions / bankruptcy
  direction text,                  -- business_favorable / business_adverse / mixed
  writeup text
)
```

### 1.4 Commentary and secondary sources

```sql
publications (
  id uuid pk,
  kind text check (kind in ('law_review','journalism','opinion','podcast_episode')),
  source_org_id uuid fk -> organizations,
  title text, author_text text, url text unique,
  published_at date,
  summary text                     -- Claude-written, as today
)
publication_cases  (publication_id fk, case_id fk, relevance text)
publication_people (publication_id fk, person_id fk)

amicus_briefs (
  id uuid pk,
  case_id uuid fk -> cases,
  filer_org_id uuid fk -> organizations,
  side text check (side in ('petitioner','respondent','neither')),
  filed_date date, brief_url text,
  summary text
)
amicus_counsel (brief_id fk, person_id fk)

legal_terms (id uuid pk, slug text unique, term text, definition text)
case_terms  (case_id fk, term_id fk)
```

Today's `articles.json` maps to `publications(kind='journalism'|'opinion')`;
law reviews are the same table with a different kind and (later) their own
fetcher. `data/terms/*.json` maps to `legal_terms` + `case_terms`.

### 1.5 Institutional knowledge layer (the DYSTL analogue)

```sql
dossiers (
  id uuid pk,
  kind text check (kind in ('doctrine','justice','advocate','court','term')),
  subject_person_id uuid fk -> people,   -- for justice/advocate dossiers
  subject_court_id uuid fk -> courts,
  subject_slug text,                     -- for doctrine dossiers: 'major-questions', 'standing', ...
  established_facts jsonb,
  analytical_positions jsonb,
  open_threads jsonb,
  prior_positions jsonb,                 -- superseded views, kept for the record
  semantic_summary text,                 -- 2–3 sentence fingerprint, regenerated post-publish
  case_count int default 0,
  updated_at timestamptz
)

dossier_events (                         -- the CONFIRM/REFINE/CHALLENGE/SUPERSEDE log
  id uuid pk,
  dossier_id uuid fk -> dossiers,
  action text check (action in ('confirm','refine','challenge','supersede')),
  triggered_by_case_id uuid fk -> cases,
  detail jsonb,
  created_at timestamptz
)

pattern_breaks (
  id uuid pk,
  dossier_id uuid fk -> dossiers,
  case_id uuid fk -> cases,
  description text,                      -- "Gorsuch joined the pragmatist bloc against the textualist reading he took in X"
  significance text,
  created_at timestamptz
)
```

**Generation-time flow (mirrors DYSTL exactly):** when the pipeline
processes a new case, it assembles the prompt from (a) the raw source
document as today, (b) the relevant doctrine dossier(s) as
`{{institutionalMemory}}`, (c) the dossiers of every participating justice
and arguing advocate, and (d) related-case content selected by comparing
the new case against every dossier's `semantic_summary` — Haiku
relevance-ranking, no vector DB, same as DYSTL Layer 2.

**Post-publish hook:** after a case summary is written, a second Claude
call reads the published summary + each touched dossier and applies the
four-action model — new vote data confirms or challenges analytical
positions; resolved threads close; superseded positions move to
`prior_positions`, never deleted. Then Haiku regenerates each touched
dossier's `semantic_summary`. Structured `votes` rows make pattern-break
detection partly *computable* here — flag any justice whose vote diverges
from their dossier's stated alignment before asking Claude to characterize
it.

### 1.6 Users (built last, but the schema is why we're here)

```sql
profiles            (id uuid pk fk -> auth.users, display_name, created_at)
saved_items         (user_id fk, kind text, ref_id uuid, created_at)
alert_subscriptions (user_id fk, kind text,      -- 'case','justice','doctrine','split'
                     ref_id uuid, channel text,  -- 'email'
                     created_at)
notifications_sent  (subscription_id fk, event text, sent_at)
```

Alert delivery: after the nightly run, diff `dossier_events` +
case-status changes against `alert_subscriptions`, send via Resend from a
Supabase Edge Function. RLS: users read/write only their own rows.

### 1.7 Ops

```sql
ingest_runs (id, started_at, finished_at, status, stats jsonb)
revisions   (id, table_name, row_id, snapshot jsonb, run_id fk, created_at)
```

`revisions` is populated by an insert/update trigger on the content tables
(`cases`, `opinions`, `publications`, `dossiers`). This is the replacement
for the git-diff audit trail: every nightly run's changes remain reviewable
and revertible.

RLS everywhere: `anon` role gets SELECT on published content tables only;
the pipeline uses the service-role key; user tables are per-user.

---

## 2. Phased execution

**Phase 1 — Scaffold (½ day).** New Supabase project; Supabase CLI +
`supabase/migrations/` in repo; write the full schema as migration files;
seed `courts` (SCOTUS + 13 circuits + 50 state supremes) and `people` /
`judgeships` for the nine sitting justices from a hand-checked seed file.

**Phase 2 — Backfill (1 day).** A `scripts/backfill-db.ts` that maps
existing `data/*.json` into the new tables. Every slug reference in the
JSON must resolve to a real row — the backfill doubles as the first-ever
integrity audit of five months of Claude-generated cross-references. Log
and fix every dangling reference it finds (create stubs where appropriate).

**Phase 3 — Dual-write (1–2 weeks of calendar time, little work).** The
pipeline writes Supabase as canonical AND regenerates the JSON exactly as
today. Site untouched. A nightly parity check diffs DB contents against the
JSON. This is the safety window — nothing user-facing can break.

**Phase 4 — Flip the reads (1 day).** Rewrite `src/lib/*.ts` accessors to
query Supabase at build time (same function signatures, so pages don't
change). Cron's last step becomes: trigger Vercel deploy hook → static
rebuild. Retire the JSON write path once stable; `data/` can remain as a
nightly exported snapshot if you want the git history to continue.

**Phase 5 — Institutional knowledge (2–3 days).** Dossier tables +
generation-time injection into `pipeline.ts`'s prompt assembly + the
post-publish four-action update hook + semantic-summary regeneration.
Start with three doctrine dossiers and the nine justice dossiers; let
Claude propose new doctrine dossiers when a case fits none (the "uncovered
signal" pattern from DYSTL).

**Phase 6 — New entity ingestion (incremental, ongoing).** Schema already
supports these; each just needs a fetcher: amicus briefs (parse the filings
list on supremecourt.gov docket pages — already being fetched for other
reasons); state supreme court cases (CourtListener covers most state courts
of last resort); law review articles (start with the flagship reviews' RSS
+ SSRN; source list TBD); appellate judge rosters (Federal Judicial Center
publishes structured data).

**Phase 7 — User features.** Supabase Auth, saved cases, alert
subscriptions, Edge Function + Resend for delivery. First real read/write
traffic from browsers; RLS gets exercised for real.

---

## 3. What DYSTL does about this (open decision)

The current `sync-to-supabase.ts` mirror into DYSTL's project becomes
redundant once SD has its own canonical DB. Options:

- **A. Repoint the mirror**: same sync code, now DB→DB (SD → DYSTL),
  keeping DYSTL's ingestion untouched. Least DYSTL-side work.
- **B. DYSTL reads SD directly**: give DYSTL's generation cron a read-only
  key to SD's project and delete the mirror. Cleaner; one copy of the data;
  requires touching DYSTL's ingestion.

Recommendation: A now, B later, so this migration never blocks on DYSTL.

## 4. Risks and their controls

- **Silent bad writes replace visible bad commits** → `revisions` table +
  a "review last night's run" admin view (list of dossier_events and
  changed rows) before this replaces git as the audit trail.
- **Dangling Claude-generated references** → real FK constraints; the
  pipeline resolves references before insert, creating stubs (as it already
  does for precedents) rather than failing the run.
- **Build-time DB dependency** → the site only touches Supabase at build
  time; a Supabase outage delays the nightly rebuild, it never takes the
  live site down. Keep the last-good build serving.
- **Schema churn** → migrations in git, applied by CI, never by hand.

## 5. Handing this to Claude Code

Do phases as separate sessions, in order, each ending with a commit.
Suggested opening prompt for Phase 1:

> Read SUPABASE_PLAN.md and ARCHITECTURE.md. Execute Phase 1 only: set up
> the Supabase CLI, create supabase/migrations implementing the full schema
> in §1 of the plan, and write seed files for courts and the nine sitting
> justices. Do not touch the existing pipeline, data/, or the frontend.
> Stop and show me the migration files before applying anything.

Then Phase 2 in a fresh session, and so on. Never let it combine phases —
Phase 3's dual-write window is the safety mechanism and skipping it means
flipping the site onto an unverified database.
