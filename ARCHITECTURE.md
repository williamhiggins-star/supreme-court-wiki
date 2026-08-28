# Architecture — Supreme Court Wiki (scotusdashboard.com)

This document maps the codebase as of 2026-08-28. The live project is
`supreme-court-wiki-app/` (a Next.js 16 app). The sibling `supreme-court-wiki/`
directory is empty (just a `.claude/` folder) and can be ignored.

## The one thing to understand first

This repo is **scotusdashboard.com**: the public SCOTUS case dashboard and the
intake system for all SCOTUS case/circuit-split data. A GitHub Actions cron
job scrapes official sources every day, calls Claude to turn raw legal
documents into structured JSON, commits that JSON straight into the repo, and
the Next.js site statically renders from those committed files — **no
database in the render path, ever**. A final, non-fatal pipeline step also
mirrors the published JSON into a separate product's (DYSTL's) Supabase
project; that mirror is write-only from here and is never read back by this
site. See `supreme-court-wiki-app/CLAUDE.md` for the full intake/render
boundary rules.

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
        reads data/*.json off disk at build/request time  →  renders pages
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

**Primary store: flat JSON files committed to git**, under
`supreme-court-wiki-app/data/`:

| Path | Contents |
|---|---|
| `data/cases/*.json` (60 files) | One file per SCOTUS case, keyed by slug. Full `CaseSummary`: docket status (`upcoming`/`petition`/`decided`), parties/arguments/key exchanges, cited precedents, legal terms used, opinion authorship, vote outcome, opinion summaries, podcast link. |
| `data/terms/*.json` (483 files) | Legal-term glossary entries, one per file, generated as a side effect of case processing. |
| `data/precedents/*.json` (390 files) | Precedent-case entries — created as lightweight stubs when cited by a case, later enriched by `enrich-precedents.ts` into full standalone entries. |
| `data/articles.json` | Aggregated, deduped, Claude-summarized news articles (90-day rolling window), each optionally linked to case slugs. |
| `data/circuit-splits.json` | Structured circuit-split records (positions, circuits, related SCOTUS case). |
| `data/appellate-impacts.json` | Business-impact circuit opinions, classified by area. |
| `data/calendar.json` | Conference dates parsed from the SCOTUS case-distribution schedule PDF. |
| `data/justices.json` | Per-justice speaking-time/question-count stats and opinion-authorship tallies, computed by `compute-justice-stats.ts` from transcripts. |
| `data/lawyers.json` | Per-counsel speaking-time and win/loss stats, computed by `compute-lawyer-stats.ts`. |
| `data/us-states-10m.json` | Static TopoJSON basemap (not pipeline-generated) used to render the circuit map. |

This is the **only** store the Next.js app reads at build/request time
(`src/lib/data.ts` and friends read straight off disk with `fs.readFileSync`)
— there is no database in the render path.

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

Next.js 16 App Router, statically rendering from `data/*.json` (via
`src/lib/*.ts` accessors — thin wrappers around `fs.readFileSync`/JSON.parse,
one file per data domain: `data.ts` for cases/terms/precedents, plus
`articles.ts`, `calendar.ts`, `circuit-splits.ts`, `circuits.ts` /
`circuits-server.ts` for the map, `justices.ts`, `lawyers.ts`,
`appellate-impacts.ts`).

**Pages** (`src/app/`):

| Route | Renders |
|---|---|
| `/` (`page.tsx`) | Homepage — docket (Upcoming/Argued/Decided columns), featured circuit splits, analysis-article preview sidebar, circuit map, court calendar, justices section, counsel section, about blurb. |
| `/docket/[column]` | Full paginated list for one docket column (`upcoming`/`argued`/`decided`), linked from the homepage's "View all" buttons. |
| `/cases/[slug]` | Full case page — background, legal question, per-party arguments/key exchanges, cited precedents, related articles, related circuit split, decision details (via `DecisionSection`). Statically generated (`generateStaticParams`). |
| `/appeals` | Full circuit-splits index (`CircuitSplitsSection`). |
| `/appellate-impacts` | Full business-impact opinions index (`AppellateImpactsSection`). |
| `/analysis` | Full analysis-articles index. |
| `/precedents` | Precedent-case index. |
| `/precedents/[slug]` | Full precedent entry (`PrecedentDecisionSection`) — statically generated. |
| `/terms` | Legal-term glossary index. |
| `/terms/[slug]` | Single glossary entry — statically generated. |
| `/api/search-index` (route handler) | JSON API assembling cases + precedents + circuit splits + appellate impacts + justices + lawyers into one search index, consumed client-side by the search modal. |

**Shared components** (`src/components/`):

- `NavBar` — top nav, hosts `SearchModal` (client-side fuzzy search over `/api/search-index`).
- `CourtCalendar` — argument/conference calendar grid.
- `CircuitMap` — interactive US map (case load + splits by circuit, using the TopoJSON basemap).
- `CircuitSplitsSection` (+ `SplitCard`, `SplitCardEmbed`) — circuit-split cards, used on both the homepage and `/appeals`.
- `AppellateImpactsSection` — business-impact opinion list.
- `JusticesSection` / `LawyersSection` — speaking-time leaderboards with per-person case breakdowns.
- `DecisionSection` / `PrecedentDecisionSection` — decision/opinion detail blocks used on case and precedent pages respectively.

**Data model:** shared TypeScript types live in `src/types/index.ts`
(`CaseSummary`, `LegalTerm`, `PrecedentCase`, `CircuitSplit`, `Article`, etc.)
— these are the contract between the pipeline scripts (which write the JSON)
and the frontend (which reads it).
