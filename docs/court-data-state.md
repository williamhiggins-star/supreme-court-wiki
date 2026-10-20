# Court data: state as of 2026-10-20

What the site now records about the Supreme Court's own actions, how it gets
them, and what's still open. Database: the "SCOTUS Dashboard" Supabase
project (ref `enwjtgjycthjypeqdgfo`). Scope: OT2026 on; no history backfill.

## 1. What exists

### Tables (migration `20261009000000_court_actions.sql`, plus `ingest_runs` from 2026-08-28)

| Table | What it holds | Who can read it |
|---|---|---|
| `court_actions` | One row per docket per order action: `docket_number`, `action` (a glossary code), `action_date`, `term`, `court_text` (the Court's own words), `source_url` (the order PDF), `source_sha256`, `case_id` (set for grants). Unique on (docket, action, date). | Pipeline only (anon has no access). |
| `court_vocabulary` | The approved glossary: 109 codes, each with the Court's phrase, source, `provenance` (`court_term` or `derived`) and `evidence` (`verified_fixture` or `unverified_recall`). | Public read. |
| `court_vocabulary_aliases` | Press and legacy labels mapped to codes: GVR, DIG, summary reversal, relist, cert granted, cert denied, upcoming → `set_for_argument`, petition → `argued`. "Emergency docket" and "shadow docket" are deliberately mapped to nothing. | Public read. |
| `summary_reversals_without_argument` | One row per summary disposition (per curiam) found in an order list: `docket_number`, `term`, `decided_date`, `court_action_id`, `case_id` (still null). **Empty so far**: none in OT2026 yet. | Pipeline only. |
| `ingest_runs` | One row per run of the order reader (`stats.job = "order_lists"`), the application reader (`"applications"`) and each emergency/shadow docket update or rebuild (`"emergency_shadow_docket"`, with the review list), plus the one-time seed (`"granted_noted_seed"`). See §3. | Pipeline only. |
| `application_details` (migration `20261021000000_applications.sql`) | One row per application (`26A…`, plus 25A named in this term's orders), in the Court's terms: caption, verbatim filing entry, type and outcome codes, Justice, filing date, lower court, docket entries, docket link, `pending`. The Court's actions on it are `court_actions` rows with the same docket number (source = the docket page). | Pipeline only. |
| `emergency_shadow_docket` (+ migration `20261022000000_esd_public_view.sql`) | Not a Court term. Applications the press may mean by it, plus related matters, by rule `esd-rule-2`. `public_view` (yes/no) is the editorial choice of what will be shown; a trigger marks hand edits (`public_view_set_by_hand`) so the pipeline never overwrites them. Updated incrementally each night; full rebuild is manual. See `docs/emergency-shadow-docket.md`. | Pipeline only. |

Live counts today: 32 `court_actions` rows (the seeded grants, all linked to cases), 0 summary reversals, 1 `ingest_runs` row (the seed).

### Case statuses (`cases.status`; migration `20261020000000_status_rename.sql`)

| Status | Meaning | On the site |
|---|---|---|
| `granted` | Cert granted (or probable jurisdiction noted), no argument date yet. The row has the docket number and a slug only; no term, sitting or argument date. | Never: the anon read policy excludes it, and the site never asks for it. |
| `set_for_argument` | Argument date ahead. The database requires the date (`cases_set_for_argument_has_date`). | The Docket's Upcoming column. |
| `argued` | Argued, not yet decided. | Argued column. |
| `decided` | Decided, including OT2025's 9 summary reversals. | Decided column, term stats. |

`stub` and `historic` rows are precedent citations, not docket cases. The old
names `petition` (which meant argued) and `upcoming` no longer exist in the
database, and the check constraint rejects them. The case JSON files still use
`docketStatus` "petition"/"upcoming" internally; `deriveStatus` in
`scripts/lib/sd-db/write.ts` maps them where the pipeline writes.

Today: 10 granted, 16 set for argument, 10 argued (4 from OT2024, 6 from OT2026), 67 decided.

### How a case moves
1. **Grant → `granted`.** The order-list reader records the grant in `court_actions`. The grant then finds its case by exact docket number:
   - an existing row is only linked (its `case_id` is set);
   - otherwise a `granted` row is created, with slug = docket number + the Court's caption from its docket page. A slug never changes after that.

   OT2026's earlier grants were seeded once from the Granted & Noted List on 2026-10-20: 22 existing cases linked, 10 created.
2. **Calendar → `set_for_argument`.** When the case appears on the argument calendar, `syncCase` finds the same row by docket number and sets the argument date and term. No duplicate row, no new slug.
3. **Argument passed → `argued`**, then **decision → `decided`**, both through the same `syncCase`.
4. **No argument date in the case file → `granted`.** This keeps the date rule satisfied, but such a case wouldn't show on the site. None exist today.

The Docket's columns come from the argument date (`src/lib/docket.ts`), not
the stored status. Cases on the same date are ordered by docket number
(applications such as `25A312` after a term's numbered petitions).

### Scripts and workflow
- `scripts/read-order-lists.ts` reads the order lists. Each run:
  - fetches the Orders of the Court listing `/orders/ordersofthecourt/{YY}`, then each order PDF not yet recorded;
  - parses grants, limited grants, probable jurisdiction noted, denials, GVRs and per curiam summary dispositions;
  - links or creates granted cases.

  It uses `scripts/lib/court-orders/{parse,fetch,pdf-text,granted-cases}.ts`. PDF text comes from `pdftotext -layout` (poppler-utils), because `pdf-parse` drops docket digits in two-column denial lists.
- `scripts/seed-granted-cases.ts`: the one-time seed. It refuses to run twice for a term. **Done for OT2026.** It needs a new run only when a new term starts.
- **Daily workflow** (`.github/workflows/daily-update.yml`): the step "Read the Court's order lists into court_actions (non-fatal)" runs before the parity check. It installs poppler-utils if it's missing.
  - The step never stops the rest of the run (`continue-on-error`).
  - Database write failures are written to `$RUNNER_TEMP/sd-write-failures.log`, and the last step, "Fail the run if any SD database write failed", turns the run red.
- `scripts/parity-check.ts` treats granted rows as expected (they have no JSON file yet).

- `scripts/read-applications.ts` reads applications. Each run:
  - reads application numbers from order PDFs on the orders listing it hasn't read yet, and from the in-chambers page (both If-Modified-Since);
  - fetches those dockets, re-fetches pending ones (If-Modified-Since), retries numbers missed below the frontier for a week, then probes the frontier (from where it last stopped, until 3 numbers in a row are 404);
  - classifies with fixed patterns (`scripts/lib/applications/parse.ts`), writes `application_details` and `court_actions`, then updates `emergency_shadow_docket` incrementally (`scripts/lib/applications/rebuild.ts`) and warns about any new application the rule can't place.

  `--reclassify` re-applies the patterns to stored records with no requests. `--backfill` raises the caps for a first fill. **Not in the daily workflow yet:** wiring it in is a separate PR, held for review.
- `scripts/rebuild-emergency-shadow-docket.ts`: the manual full rebuild, for a new rule version. Keeps hand-set `public_view`. No requests.
- **How each nightly table is written** (kept consistent): incremental (only new or changed rows) for `court_actions`, `application_details`, `emergency_shadow_docket`, `cases`, `case_podcast_episodes`, and `ingest_runs` (append-only); per case it touches, `syncCase` deletes and reinserts that case's `opinions`, `votes`, `citations`, `case_terms` and `decisions`; rewritten whole per term every night: the derived stats `justice_stats`, `lawyer_stats`, `term_opinion_stats`.

### Fixtures and tests
- **Saved Court pages:** `scripts/fixtures/orders/`.
  - The OT2026 Orders of the Court listing.
  - Order lists as `pdftotext -layout` text: 2025-11-10, 2025-12-08 (with the Doe v. Dynamic Physical Therapy per curiam), 2026-06-30 and 2026-10-05.
  - Miscellaneous orders: 2025-10-10, plus two from 2026-10-07.
  - The 2026-10-08 in-chambers order on application 26A476.
  - The OT2026 Granted & Noted List as of 2026-10-13.
- **Tests:**
  - `npx tsx scripts/test-order-lists.ts`: parser, 16 checks.
  - `npx tsx scripts/test-granted-cases.ts`: list parser, and `getAllCasesForTerm` dropping a granted row through its own query. 4 checks.
  - `scripts/test-granted-to-set-for-argument.ts`: granted → set_for_argument → argued with the real `syncCase`. 8 checks. It needs a throwaway database (see §4) and skips without one.
  - The older tests: `test-party-sections`, `test-key-exchange-writes`, `test-opinion-classification`, `test-transcript-list`.

## 2. Request budget, limits, kill switch
- **Approved budget:**
  - at least 2 s between requests, one at a time;
  - an identifying User-Agent (`SCOTUSDashboard-orders/1.0 (+https://scotusdashboard.com)`);
  - If-Modified-Since on the listing;
  - back off on 429, 5xx and network errors, and halt after 3;
  - halt at once on a 403;
  - at most 1,500 requests a day (2,500 during a backfill).

  The code enforces all of this in `scripts/lib/court-orders/fetch.ts`, with a cap of 40 requests per nightly run and 80 for the seed.
- **Daily cap across jobs** (`scripts/lib/court-orders/daily-cap.ts`): the application reader sums `stats.requests` of today's `ingest_runs` and stops at 1,500 (2,500 with `--backfill`). Its per-run cap is 80 (900 with `--backfill`).
- **Typical use:**
  - a quiet night: 1 request (listing 304, not modified);
  - an order day: the listing, plus each new PDF, plus one docket page per new grant;
  - the seed took 11 requests.
- **Each order PDF is fetched once.** A PDF counts as done once it's listed in an earlier run's `stats.documents`.
- **Application reader, typical night:** about 15–40 requests: the listing and the in-chambers page (usually 304), any new order PDF, about 5 new dockets plus 3 misses at the frontier, and the pending applications (usually 304). The first fill on 2026-10-20 took 574 requests in two runs (537 applications), plus 103 for the 25A look-back.
- **Kill switch:** set the GitHub repository variable `COURT_ORDERS_OFF` to `1` (it stops the application reader too) (Settings → Secrets and variables → Actions → Variables). The step then exits before making any request. Delete the variable, or set any other value, to turn the reader back on.

## 3. Did the nightly run behave? (check procedure)
The first live nightly run with the reader is the run starting around 22:00 UTC on 2026-10-20 (#16 and #17 were merged that morning).

1. `gh run list --workflow daily-update.yml --limit 1`: the run should be `completed`/`success`. In `gh run view <id> --log`, check the step "Read the Court's order lists…":
   - it prints `[orders] OT2026: N order PDF(s) not yet recorded.`, one line per PDF, and a final `[orders] succeeded: … request(s).`;
   - there are no `::error` lines;
   - the final step prints "No SD database write failures."
2. The latest reader run:
   ```sql
   select status, stats->>'requests' requests, stats->>'complete' complete,
          jsonb_array_length(stats->'documents') pdfs, stats->'grantedCasesCreated' created,
          stats->'grantedCasesLinked' linked, stats->>'halted' halted
   from ingest_runs where stats->>'job' = 'order_lists' order by started_at desc limit 1;
   ```
   - **Expected for the first run:** `succeeded`, complete `true`, no `halted`, about 11 requests.
     - The PDFs: 8 OT2026 order PDFs listed at the time of writing (Oct 5, 7 ×3, 8, 13 ×2, 19), plus any newer.
     - `created`: `26-12…` and `26-204…`.
   - On later quiet nights: 1 request.
   - **A `halted` value** means the budget stopped the run (rate limit, 403, or the cap); the next night retries.
   - **No row at all for that night** means the step was skipped, by the kill switch or an earlier crash.
3. **First live `court_actions` rows:**
   - `select action, count(*) from court_actions group by 1;` Expect many `petition_denied`, about a dozen `granted_vacated_remanded`, and the grants.
   - The 3 Oct 13 grants (25-1103, 25-1343, 25-7026) already exist from the seed. Their `court_text` and `source_url` are replaced by the order list's, and their `case_id` stays.
4. **26-12 and 26-204** (granted Oct 19):
   ```sql
   select a.docket_number, a.action, c.slug, c.status
   from court_actions a join cases c on c.id = a.case_id
   where a.docket_number in ('26-12','26-204');
   ```
   Expect `26-12` as `granted_limited_to_question` and `26-204` as `petition_granted`, each with a new `granted` case. Locally the slugs were `26-12-association-for-education-fairness-v-montgomery-county-board-of-education` and `26-204-department-of-justice-v-scott-mcnutt`. Anon must not see them.
5. **Statuses written under the new names:** `select status, count(*) from cases where status not in ('stub','historic') group by 1;` Only `granted`, `set_for_argument`, `argued` and `decided` should appear, and the run should have no write failures from the `syncCase` steps.
6. **Kill switch off:** `gh variable list` shows no `COURT_ORDERS_OFF=1`.

## 4. Migration safeguards (CLAUDE.md "Migration exception")
Claude Code may apply an SD migration only with Will's authorization in words in that session. The steps:
1. **Before:**
   - `supabase db push --linked --dry-run` shows only that migration;
   - query the live definitions of everything it alters;
   - snapshot twice and confirm the two are identical.
2. **Apply:** `supabase db push --linked`.
3. **After:** snapshot twice and compare with the pre-migration snapshot. If anything differs, or the push fails, stop and report. Don't patch live.
4. **Report** with the before/after comparison and the rollback SQL.

**Snapshot tools, now in the repo** (`docs/migration-snapshot/`; they used to live only in a scratch folder, which was cleared once, and were rebuilt from the session transcript):
- `visitor-snapshot.ts`: everything the site shows, read with the anon key:
  - the `/dashboard` payload;
  - a live recompute of the Opinions Data metrics;
  - `term_opinion_stats`, `justice_stats` and `lawyer_stats`;
  - all 24 `term_stats_*` views;
  - the status census.

  Run it with `SNAPSHOT_DIR=<scratch> FREEZE_TODAY=<date> npx tsx docs/migration-snapshot/visitor-snapshot.ts <label>`.
- `privileged-hashes.sql`: service-role hashes of the views, the stats tables, opinions, decisions, docket entries and non-granted cases. Run it with `supabase db query --linked -f docs/migration-snapshot/privileged-hashes.sql`.
- `compare-unordered.js`: compares two snapshots ignoring array order. A byte diff that disappears here is ordering only.

**Throwaway database for `test-granted-to-set-for-argument.ts`:**
1. Run Homebrew Postgres 17 on port 54329 (TCP).
2. Create the roles `anon`, `authenticated`, `service_role` (with bypassrls) and `authenticator`.
3. Apply every file in `supabase/migrations/` in order. Before `20261009000000`, recreate the `issue_categories` drift: a table with a public read policy, plus `cases.issue_category_id`.
4. Load `courts` and `people` from live, read-only.
5. Run PostgREST 16 with a small proxy that serves it under `/rest/v1`.
6. Sign anon and service JWTs with PostgREST's secret.
7. Then run: `TEST_SUPABASE_URL=… TEST_SUPABASE_SERVICE_ROLE_KEY=… TEST_SUPABASE_ANON_KEY=… npx tsx scripts/test-granted-to-set-for-argument.ts`

## 5. Known issues and flags
- **"Probable jurisdiction noted"** is tested only with an invented example; no saved order list has the wording yet. Check the first real one.
- **Per curiams published only on the opinions page,** not attached to an order list, aren't picked up. The reader reads only the orders listing.
- **Two old OT2025 transcript 404s:** 24-699 and 24-983, in the nightly key-exchange fill step. They pre-date this work.
- **Lint has one old error** (`src/components/ScrollableRegion.tsx:43`, setState inside an effect) and 16 warnings. That's the baseline every PR here was held to.
- **Tie-order placeholders:**
  - Same-date cases are ordered by docket number until the Court's argument order or time of day is available.
  - Tied agreement figures are ordered by Justice slug (`getJusticeAgreementGrid`).
- **Full-name slugs:** new cases get docket number + the Court's docket-page caption, which uses full names (e.g. `25-1131-missionaries-of-saint-john-the-baptist-v-joel-frederic`). Older slugs were shorter. Existing slugs never change.
- **Grant actions:** the seed recorded list grants as `petition_granted` (or `probable_jurisdiction_noted` for appeals). The list doesn't say whether a grant was limited, so only grants read from order lists can be `granted_limited_to_question`.
- **Requests outside the budget helper:**
  - `syncCase`'s party-name caption fetch: one plain request per new OT2026 case, no spacing.
  - `backfill-docket-entries.ts` uses a 300 ms delay, but it's a manual script.
- **Unread order-list sections:** the reader skips applications (`A`), motions (`M`), original actions, rehearings, extraordinary writs and Rule 39.8 dismissals by design. An unknown all-caps heading logs a `::warning`.
- **A case file with no argument date** is written as `granted`, so it would be hidden rather than shown undated. None exist today.
- **GitHub reports no status checks** on this repo, so "mergeable" was checked by hand: typecheck, lint baseline, tests.

## 6. Not done yet
- **Applications in the daily run:** the workflow step is a separate PR held for review. Until it merges, `read-applications.ts` runs only by hand.
- **25A applications:** a one-time look-back (`--look-back=25:100`, 2026-10-20, 103 requests) found the series ends at 25A1468 and recorded 25A1368–25A1468; none was still pending. Older 25A applications are found only when an OT2026 order or the in-chambers page names them. Next October, run `--look-back=26:100` once after the rollover.
- **Pending cert petitions:** a `dockets` table plus a frontier probe for newly docketed petitions. Dispositions would come from the order lists already read.
- **Summary reversals into `cases`:** add them as `decided` with a per curiam opinion, as OT2025 and Feldman do, once vote detail can be captured and checked. Until then they are in `summary_reversals_without_argument` only.
- **More frequent order-list runs:** it runs once a day today. Add more only if same-day latency matters.
- **Retiring the committed JSON:** `data/cases/*.json` and the other pipeline-only files. The case files' `docketStatus` vocabulary goes with them.
