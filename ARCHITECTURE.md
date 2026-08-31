# Architecture — Supreme Court Wiki (scotusdashboard.com)

This document maps the codebase as of **2026-08-31, post root-cutover**
(the new UI replaced the legacy JSON-rendered site on the live domain —
see "The one thing to understand first" below for what that changed).
The live project is `supreme-court-wiki-app/` (a Next.js 16 app). The
sibling `supreme-court-wiki/` directory is empty (just a `.claude/`
folder) and can be ignored.

## The one thing to understand first

This repo is **scotusdashboard.com**: the public SCOTUS case dashboard and the
intake system for all SCOTUS case/circuit-split data. A GitHub Actions cron
job scrapes official sources every day, calls Claude to turn raw legal
documents into structured JSON, and commits that JSON straight into the
repo — **that intake pipeline is unchanged and still the source of truth
for case lifecycle.** A final, non-fatal pipeline step also mirrors the
published JSON into a separate product's (DYSTL's) Supabase project; that
mirror is write-only from here and is never read back by this site. See
`supreme-court-wiki-app/CLAUDE.md` for the full intake/render boundary
rules.

**What changed 2026-08-31: the live site itself.** Through 2026-08-28 the
Next.js site statically rendered everything from the committed
`data/*.json` files, no database in the render path at all. That's no
longer true. The legacy page tree (`/`, `/cases/[slug]`, `/precedents*`,
`/terms*`, `/appeals`, `/appellate-impacts`, `/analysis`,
`/docket/[column]`) was **deleted outright**, not superseded — that
functionality (precedents glossary, legal-terms glossary, appellate
impacts, the full circuit-splits browser) is off the live site entirely.
In its place, `/welcome` (entry carousel) and `/dashboard` (the app
itself) are now the whole site; `/dashboard` reads live, in its render
path, from a *third* Supabase project — "SCOTUS Dashboard" (ref
`enwjtgjycthjypeqdgfo`), separate from both the `data/*.json` files and
from DYSTL's mirror — for case detail, opinions, term stats, transcripts,
Spotify links, and key exchanges. Full detail in §3 and §5 below and in
`CLAUDE.md`.

```
GitHub Actions cron (22:00 UTC daily)
        │
        ▼
scripts/update-cases.ts + fetch-*.ts  ──►  data/*.json  ──►  git commit + push
        │  (scrape SCOTUS/CourtListener/RSS/Spotify, call Claude to structure it)
        │
        ▼ (final, non-fatal step)
scripts/sync-to-supabase.ts  ──►  DYSTL Supabase (scotus_* / raw_articles tables)
                                    (outbound mirror only — this site never reads it)

Next.js app (src/app, src/components, src/lib)
        /welcome, /dashboard  ──►  read some data/*.json directly
                                    (calendar, articles, circuit-splits)
                              ──►  read case/opinion/term-stat data live
                                    from the "SCOTUS Dashboard" Supabase
                                    project (src/lib/db/*.ts)
```

---

## 1. External data sources

All fetched by scripts in `supreme-court-wiki-app/scripts/`, run either
manually (`npx tsx scripts/<name>.ts`) or by the daily GitHub Actions job.

| Source | What's fetched | Script(s) |
|---|---|---|
| **supremecourt.gov** | Oral argument transcript PDFs (`/oral_arguments/argument_transcripts/<term>`), upcoming argument calendar (`/oral_arguments/argument_calendars.aspx`), docket pages (`/docket/docketfiles/html/public/<case>.html`), slip opinion PDFs (`/opinions/slipopinion/<year>`), case-distribution/conference-schedule PDF | `scripts/update-cases.ts`, `scripts/process-transcript.ts`, `scripts/process-upcoming.ts`, `scripts/fetch-opinion-authors.ts`, `scripts/compute-justice-stats.ts`, `scripts/compute-lawyer-stats.ts`, `scripts/backfill-key-exchanges.ts`, `scripts/retry-hamm.ts` (shared PDF/HTML fetch helpers live in `scripts/pipeline.ts`) |
| **CourtListener API** (`courtlistener.com/api/rest/v4`) | Full-text search of published federal circuit opinions (by business-impact keyword queries and by circuit-split acknowledgment phrases), opinion cluster/full-text lookups | `scripts/fetch-circuit-splits.ts`, `scripts/fetch-appellate-impacts.ts` — requires `COURTLISTENER_API_KEY` |
| **RSS feeds** (SCOTUSblog, The Atlantic, The New Yorker, NY Mag Intelligencer, NYT Politics, NYT Opinion, Washington Post, The Dispatch, Financial Times) | Recent article metadata (title/link/date/author/description), filtered for SCOTUS relevance | `scripts/fetch-analysis-articles.ts` |
| **Spotify Web API** | Episode list for the SCOTUS oral-arguments podcast show, matched to case titles by keyword overlap | `scripts/fetch-spotify-episodes.ts` — requires `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (client-credentials flow) |
| **DYSTL Supabase** (outbound only) | Not a read source for this repo — see §2/§3 for the mirror write | `scripts/sync-to-supabase.ts`, `scripts/backfill-supabase.ts`, `scripts/lib/supabase-sync/*` |

## 2. Every Claude/Anthropic API call

All calls use `@anthropic-ai/sdk`. Model defaults to `claude-opus-4-6` (some
lighter-weight calls default to `claude-sonnet-4-6`), overridable via the
`MODEL` env var. Requires `ANTHROPIC_API_KEY`.

| File | Call site | Purpose |
|---|---|---|
| `scripts/pipeline.ts` | `generateSummary()` — streaming `messages.stream()` with adaptive thinking | Shared helper: turns a raw oral-argument transcript into the structured case JSON (title, legal question, background, significance, per-party arguments + key exchanges, cited precedents, legal terms). Used by both the automated daily run and the manual CLI. |
| `scripts/update-cases.ts` | `processUpcomingCases()` — non-streaming `messages.create()` | Structures a **docket page** (petition/briefs, no argument yet) into the same case schema for cases scheduled but not yet argued (`docketStatus: "upcoming"`), with `keyExchanges` forced empty. |
| `scripts/update-cases.ts` | `fillMissingKeyExchanges()` — `messages.create()` | Backfills `keyExchanges` (justice ↔ counsel Q&A highlights) for cases that were promoted from "upcoming" to "argued" before their transcript existed. |
| `scripts/process-upcoming.ts` | manual CLI equivalent of the above, `messages.create()` with retry loop | Same "upcoming case from docket page" structuring, run by hand for a single case number. |
| `scripts/process-transcript.ts` | manual CLI wrapper around `pipeline.ts`'s `generateSummary()` | Same transcript→case-summary flow, run by hand for a single transcript URL. |
| `scripts/enrich-precedents.ts` | `messages.stream()` with adaptive thinking | Expands a precedent-case stub (just name/citation/why-cited, created as a side effect of transcript processing) into a full standalone wiki entry: background, party arguments, holding, vote count, dissents, concurrences. |
| `scripts/fetch-opinion-authors.ts` | `generateOpinionSummaries()` — `messages.create()` | Given the decided opinion's full text and the regex-parsed author list, writes plain-English summaries of the majority opinion and each concurrence/dissent. (Author *detection* itself is done with regex, not Claude — see §5 note below.) |
| `scripts/fetch-analysis-articles.ts` | `summariseBatch()` — `messages.create()`, batches of 20 | Summarizes each new RSS article in 2–3 sentences and tags it with related SCOTUS case slugs from the current term. |
| `scripts/fetch-appellate-impacts.ts` | `analyzeImpacts()` — `messages.create()` | Reads full text of recent circuit opinions pulled from CourtListener and classifies/writes up those with business impact (securities, antitrust, labor, IP, arbitration, class actions, bankruptcy), including positive/negative implications. |
| `scripts/fetch-circuit-splits.ts` | `analyzeSplits()` — `messages.create()` | Cross-references CourtListener opinions that acknowledge circuit disagreement with pending SCOTUS cases, and produces structured `CircuitSplit` entries (positions, which circuits hold which view, link to the SCOTUS case if cert has been granted). |
| `scripts/backfill-key-exchanges.ts` | `messages.create()` with retry | One-time/idempotent backfill of `keyExchanges` for older argued cases that never got them (same prompt shape as `update-cases.ts`'s backfill step). |
| `scripts/retry-hamm.ts` | `messages.create()` | One-off manual retry script for a single case (24-872, *Hamm v. Smith*) whose streaming call previously failed; non-streaming with a smaller char limit. |

## 3. Where processed data lives

**Flat JSON files committed to git**, under `supreme-court-wiki-app/data/`.
Every file below is still written daily by the pipeline (see §4) — that
part hasn't changed. What changed 2026-08-31 is which of them the *site*
still reads; the "Rendered?" column reflects that:

| Path | Contents | Rendered? |
|---|---|---|
| `data/cases/*.json` (60 files) | One file per SCOTUS case, keyed by slug. Full `CaseSummary`: docket status, parties/arguments/key exchanges, cited precedents, legal terms used, opinion authorship, vote outcome, opinion summaries, podcast link. | Pipeline-only — `/dashboard` reads case data from Supabase instead (§5). |
| `data/terms/*.json` (483 files) | Legal-term glossary entries, generated as a side effect of case processing. | Pipeline-only — no live page reads these (the glossary was removed). |
| `data/precedents/*.json` (390 files) | Precedent-case entries, enriched by `enrich-precedents.ts`. | Pipeline-only — no live page reads these (removed). |
| `data/articles.json` | Aggregated, deduped, Claude-summarized news articles (90-day rolling window). | **Rendered** — `/dashboard`'s Third Party Analysis section, via `src/lib/articles.ts`. |
| `data/circuit-splits.json` | Structured circuit-split records. | **Rendered** — used for per-case circuit-split lookups in `/dashboard`, via `src/lib/circuit-splits.ts`. No standalone browser page anymore (removed). |
| `data/appellate-impacts.json` | Business-impact circuit opinions, classified by area. | Pipeline-only — no live page reads these (removed). |
| `data/calendar.json` | Conference dates parsed from the SCOTUS case-distribution schedule PDF. | **Rendered** — `/dashboard`'s Court Calendar section, via `src/lib/calendar.ts`. |
| `data/justices.json` | Per-justice speaking-time/question-count stats and opinion-authorship tallies. | Pipeline-only — `/dashboard` computes justice stats from Supabase's `justice_stats` table instead; only the `JusticeStat` *type* is still imported from `src/lib/justices.ts`. |
| `data/lawyers.json` | Per-counsel speaking-time and win/loss stats. | Pipeline-only — no live page reads these (removed). |

`data/us-states-10m.json` (the circuit-map basemap) was deleted 2026-08-31
— it had exactly one reader (the legacy circuit map), which was deleted
with it, and nothing else touched it.

All of the "pipeline-only" files above are still real dependencies —
`backfill-db.ts`, `parity-check.ts`, and the Supabase sync scripts all
read them — just not the site itself. Don't delete one because the site
doesn't render it; check `scripts/` first.

**Live Supabase read, in the render path: the "SCOTUS Dashboard"
project.** A third store — Supabase project ref `enwjtgjycthjypeqdgfo`
(**not** DYSTL's project below, and not the `data/*.json` files above) —
was built across several sessions as this repo's own read layer for term
statistics: `cases`, `opinions`, `decisions`/`decision_ties`,
`key_exchanges`, `oral_argument_transcripts`, `case_podcast_episodes`,
`justice_stats`, and 23 `term_stats_*` views (full schema/derivation
reference: `docs/term-stats-coding-rules.md`). `src/lib/db/*.ts` queries
this project directly in `/dashboard`'s render path (case detail, opinion
structure, transcripts, Spotify links, key exchanges, term/justice
stats). As of 2026-08-31 this **is** the live site's render path, not a
side exception on an unused route — see `CLAUDE.md`'s "Root cutover"
note.

**Secondary store (outbound mirror only): DYSTL Supabase.** After the daily
JSON commit, `scripts/sync-to-supabase.ts` (wrapped so any failure is
non-fatal and never blocks the commit) upserts the same data into Supabase
tables `scotus_cases`, `scotus_circuit_splits`, `raw_articles`, plus derived
`scotus_case_events` / `scotus_split_events` rows (content-hash-checked
upserts + dedup'd event inserts, implemented in `scripts/lib/supabase-sync/`).
This mirror feeds a separate downstream product (DYSTL); this repo never
reads it back. `scripts/backfill-supabase.ts` is the equivalent one-time,
manually-run, fail-loud version of the same sync logic for seeding that
mirror initially.

## 4. Cron / scheduled job setup

Single GitHub Actions workflow: `.github/workflows/daily-update.yml`.

- **Trigger:** `cron: "0 22 * * *"` (22:00 UTC daily) + manual
  `workflow_dispatch` (optionally overriding `TERM_YEAR`).
- **Runner:** `ubuntu-latest`, 120-minute timeout.
- **Steps, in order:**
  1. Checkout (`fetch-depth: 0`) + Node 20 setup + `npm ci`
  2. `scripts/update-cases.ts` — the main daily pipeline (promote upcoming→argued, process new transcripts, fill missing key exchanges, fetch upcoming arguments, fetch slip opinions, update the conference calendar). Needs `ANTHROPIC_API_KEY`.
  3. `scripts/fetch-opinion-authors.ts` — parse authorship out of newly filed slip opinions and generate opinion summaries. Needs `ANTHROPIC_API_KEY`.
  4. `scripts/compute-justice-stats.ts` — recompute `data/justices.json`.
  5. `scripts/compute-lawyer-stats.ts` — recompute `data/lawyers.json`.
  6. `scripts/fetch-circuit-splits.ts` — needs `ANTHROPIC_API_KEY` + `COURTLISTENER_API_KEY`.
  7. `scripts/fetch-appellate-impacts.ts` — needs `ANTHROPIC_API_KEY` + `COURTLISTENER_API_KEY`.
  8. `scripts/fetch-analysis-articles.ts` — needs `ANTHROPIC_API_KEY`.
  9. `scripts/fetch-spotify-episodes.ts` — needs `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.
  10. **Commit** — `git add data/`, commit as "Supreme Court Wiki Bot" with `[skip ci]`, push directly to the checked-out branch (no PR).
  11. **Sync to Supabase** (`continue-on-error: true`) — `scripts/sync-to-supabase.ts`, needs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`; runs *after* the commit so a sync failure can never block the data commit.
- All the enrichment/manual scripts (`enrich-precedents.ts`,
  `process-transcript.ts`, `process-upcoming.ts`, `backfill-*.ts`,
  `retry-hamm.ts`) are **not** part of the cron — they're run by hand
  (`npm run <script>` or `npx tsx scripts/<name>.ts`) as needed.

## 5. Frontend map

Next.js 16 App Router. As of the 2026-08-31 root cutover, the entire site
is two routes plus three redirects (`next.config.ts`'s `redirects()`) —
everything else 404s.

**Pages** (`src/app/`):

| Route | Renders |
|---|---|
| `/` | 307 → `/welcome`. No page component — the bare domain has to land somewhere, and `/welcome` is the intended entry point. |
| `/welcome` (`welcome/page.tsx`, `ScotusDashboard2LandingClient`) | Entry carousel cycling four panels pulled from the real dashboard (About's image panel, two Alignment panels, one Chief Justice panel). Renders the actual `/dashboard` tree hidden underneath itself the whole time (shared `getScotusDashboard2Data()`, so the two routes can't drift on what data they need) — "Enter" slides the overlay up to reveal it already-rendered, then navigates to `/dashboard`. |
| `/dashboard` (`dashboard/page.tsx`, `ScotusDashboard2Client` + `SectionPanels`) | The app itself. Sections (About, Docket, Court Calendar, All Cases, Opinions Data, Third Party Analysis) are client-state, not separate routes; case detail is `?case=<slug>` on this same route, opened in-place (`CaseDetailPanels`), not a separate page. |
| `/cases/:slug` | 307 → `/dashboard?case=:slug`. Carries real traffic — this path was live and likely indexed/bookmarked before the cutover. |
| `/docket/:column` | 307 → `/dashboard`. No section-deep-link exists yet to land on the right panel specifically. |

Everything else that used to be a page — `/appeals`, `/appellate-impacts`,
`/analysis`, `/precedents(/:slug)`, `/terms(/:slug)`, `/api/search-index`
— is gone, no redirect, 404. That functionality (precedents glossary,
terms glossary, appellate impacts, the full circuit-splits browser, the
site search) doesn't exist on the live site; the underlying pipeline data
still gets written daily (§3) in case it's ever rebuilt into the new UI.

**Data layer** (`src/lib/`):

- `src/lib/scotusdashboard2-data.ts` — `getScotusDashboard2Data()`, the
  single function both `/welcome` and `/dashboard` call for everything
  they render. Mixes three sources: Supabase (`src/lib/db/*.ts`, for
  case/opinion/term-stat data), three `data/*.json` files still read
  directly (`calendar.ts`, `articles.ts`, `circuit-splits.ts`), and pure
  computation with no I/O of its own (`docket.ts`).
- `src/lib/docket.ts` — `formatDate`/`getDocketStatus`/`buildDecidedList`/
  `DecidedItem`. Extracted out of the old homepage's `page.tsx` during the
  cutover (that file no longer exists) since the new UI's data layer
  depended on it; these are pure functions over an already-fetched
  `CaseSummary[]`, no file or DB access themselves.
- `src/lib/db/*.ts` — the Supabase accessor layer for the "SCOTUS
  Dashboard" project (§3).
- `src/lib/justices.ts` — still around for its `JusticeStat` type (the
  new UI imports the type, not the JSON-reading function); its
  `getJusticesData()` is dead code post-cutover, left in place rather
  than trimmed.

**Shared components** (`src/components/`), post-cutover: `SectionPanels`
(the bulk of `/dashboard`'s six sections), `CaseDetailPanels` +
`CaseTitleBar` (in-place case view), `BottomTabBar` + `DashboardTitleBar`
(nav), `LandingCarousel` (the `/welcome` carousel), `CourtCalendar`,
`ScrollableRegion`. Deleted with the legacy pages: `NavBar`,
`SearchModal`, `CircuitMap`, `CircuitSplitsSection`,
`AppellateImpactsSection`, `JusticesSection`, `LawyersSection`,
`DecisionSection`, `PrecedentDecisionSection`.

**Styling note:** `src/app/globals.css` references CSS custom properties
(`--tan`, `--cream`, `--charcoal`, etc.) throughout the new UI's
components that are never actually defined anywhere. That's intentional,
not a bug to fix — the fallback rendering it produces is the confirmed
intended look (2026-08-31); defining them to the brand doc's values would
restyle the live site. See `CLAUDE.md`.

**Data model:** shared TypeScript types live in `src/types/index.ts`
(`CaseSummary`, `LegalTerm`, `PrecedentCase`, `CircuitSplit`, `Article`, etc.)
— these are the contract between the pipeline scripts (which write the JSON)
and the frontend (which reads what it still reads directly).
