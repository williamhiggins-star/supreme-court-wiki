# CLAUDE.md — supreme-court-wiki-app

## What this repo is, and the one boundary that must never blur

This is **scotusdashboard.com**: the public SCOTUS case dashboard and the **intake system** for all SCOTUS case and circuit-split data. It is the **source of truth for case lifecycle** — cert, argument, decision, split status. It runs a daily automated pipeline (GitHub Actions) that fetches and commits case data to this repo, and the site renders from that committed data.

DYSTL is a **separate system in a separate repo**. DYSTL consumes a mirror of this dashboard's data and layers *analysis* on top of it (the six-block doctrine model, the DYSTL-voice briefings, the standing assessments). **Analysis never lives here. Intake never moves to DYSTL.**

Data flows out of this repo and never back into it. The daily pipeline both writes to and reads from DYSTL Supabase; the public site does neither.

```
scotusdashboard (intake, source of truth)
        │
        ├─ daily pipeline ──► DYSTL Supabase (scotus_* tables)
        │                       ▲          │
        │                       └──────────┘
        │                   pipeline reads doctrines to classify
        │                   events and write signals/assessments
        │                   — all results stay in DYSTL
        │
        └─ commits data/*.json ──► pipeline-only for most of it now (see
                                    below) ──► the live site (/welcome,
                                    /dashboard) reads case/opinion/term-stat
                                    data live from its own "SCOTUS Dashboard"
                                    Supabase project instead
                                            │
                                            ▼
                                   DYSTL analysis + briefings
                                   consume the mirrored data
```

Nothing flows back from DYSTL into **this repo**. The intelligence layer's outputs — doctrine signals, standing assessments, assessment versions — are written to DYSTL's Supabase, never committed here. This repo does not import DYSTL analysis and does not change how it renders because of DYSTL.

**Render and pipeline are separate surfaces, and the Supabase boundary applies to them differently:**

- **(a) The public site never touches DYSTL Supabase.** That boundary is unchanged and absolute. It does, however, now touch a *different* Supabase project in its render path — see "Root cutover" below; that's a deliberate, separate exception to the older "no DB in the render path" rule, not a DYSTL boundary violation. New Phase D surfaces render from a pipeline-written `data/doctrines.json`, not from a live query.
- **(b) The daily pipeline may read and write DYSTL Supabase** as part of the intelligence layer — the outbound mirror (A2), the analysis-feed sync (S1), event classification against doctrine indicators (B1), the assessment engine (B2), and embeddings (B4). These are pipeline steps, not render paths, and their reads exist to produce writes that land in DYSTL.

The distinction that still matters: **a DYSTL Supabase read is allowed in the pipeline and forbidden in the render path.** If a change would put a *DYSTL* Supabase call anywhere the site's request path can reach it, that is out of scope and must be raised at a gate. (The "SCOTUS Dashboard" Supabase project, below, is a separate exception already granted for the live site's own render path — see "Root cutover.")

**If a task in this repo would change intake behavior or the daily commit, stop and flag it — that is out of scope for SCOTUS 2.0 and must be raised at a gate.** Changing how the public site renders is no longer automatically out of scope the way it once was — see "Root cutover" for what's actually live today.

**Root cutover (2026-08-31): the new UI is now the live site, not a side exception.** What used to be described here as a narrowly-scoped `scotusdashboard2` exception on the `ui-redesign` branch has since been merged to `main` and deployed to production — the old JSON-rendered homepage and its whole page tree (`/`, `/cases/[slug]`, `/precedents*`, `/terms*`, `/appeals`, `/appellate-impacts`, `/analysis`, `/docket/[column]`) are **deleted**, not just superseded. The live site today is two routes: `/welcome` (entry carousel) and `/dashboard` (the app itself — root `/` redirects to `/welcome`; `/cases/:slug` and `/docket/:column` redirect into `/dashboard`, everything else 404s). `/dashboard` reads live, in its render path, from a **third** Supabase project — "SCOTUS Dashboard" (ref `enwjtgjycthjypeqdgfo`; **not** DYSTL's project, ref `bclgsfgcdxxfayonynvl`) — built across many sessions as this repo's own read layer for term statistics (`decisions`, `opinions`, `key_exchanges`, `oral_argument_transcripts`, `case_podcast_episodes`, `term_opinion_stats` (materialized nightly — see the 2026-09-22 status update below), the `term_stats_*` views — see `docs/term-stats-coding-rules.md`). `src/lib/db/*.ts` is the accessor layer for it. This remains scoped to that one Supabase project — DYSTL's Supabase is still never read by the site — but it is no longer scoped to a side branch or an unused route; it **is** the production render path now. See `ARCHITECTURE.md` for the full current route/data map, including which `data/*.json` files are still rendered directly (`calendar.json`, `articles.json`, `circuit-splits.json`) versus pipeline-output-only now (`cases/*.json`, `precedents/*.json`, `terms/*.json`, `justices.json`, `lawyers.json`, `appellate-impacts.json` — still written and read by pipeline/backfill/parity scripts, just no longer rendered anywhere).

**Do not "fix" the undefined `--tan`/`--cream`/etc. CSS custom properties in `src/app/globals.css`.** They're referenced throughout the new UI's components but never defined — that's intentional, confirmed with Will (2026-08-31): the fallback rendering that produces is the actual intended look, and defining them to the brand doc's hex values would restyle the live site, not fix a bug.

**Status update (2026-09-18): OT2026 term rollover, and a new "Proceedings & Documents" case panel — both live.**

- **Term rollover.** The dashboard now tracks OT2026 alongside OT2025, starting ahead of OT2026's own Oct 1 auto-detect cutover rather than waiting for it. `scripts/update-cases.ts`'s `fetchUpcomingArguments()` was rewritten — its old URL (`argument_calendars.aspx`) now 404s; SCOTUS moved that page to `calendarsandlists.aspx`, which links monthly PDF calendars instead of listing cases inline, so it now downloads and parses those. `data/calendar.json` was restructured from a single flat object (overwritten whole by every pipeline run — confirmed this silently dropped OT2025's conference dates the first time it ran for OT2026) to `{terms: {"2025": {...}, "2026": {...}}}`, merged/upserted per term. The render path (`scotusdashboard2-data.ts`, plus `compute-lawyer-stats.ts`/`fetch-circuit-splits.ts`/`fetch-analysis-articles.ts`/`CaseDetailPanels.tsx`'s article matching) all key off a literal `TRACKED_TERMS = ["2025", "2026"]` — not a `currentTermYear()`-relative window — by deliberate choice: **bump this list by hand each October when a new term starts.** All Cases gained a Term filter (defaults to the current term; clearing it shows every tracked term merged) and now shows every Docket status, not just decided.
- **"Proceedings & Documents" case panel.** New `public.docket_entries` table (migration `supabase/migrations/20260918000000_docket_entries.sql`, same shape/RLS as `oral_argument_transcripts.sql`) holds each case's SCOTUS docket "Proceedings and Orders" log — date, description, a keyword-classified `document_type` (petition-stage / merits brief / amicus brief / motion / order-scheduling / record / other), and its linked PDFs. `scripts/lib/docket-proceedings.ts` parses the real `<table class="ProceedingItem">` markup (not `update-cases.ts`'s blunt tag-strip, which still does its own separate job for the LLM case-summary prompt and is untouched). `scripts/backfill-docket-entries.ts` has been run against all 88 docket-relevant cases in the tracked terms (4,245 entries total) — **it is a manual backfill script, not wired into the daily cron yet.** A case's `docket_entries` won't pick up new filings after decision or after its own last backfill run until that wiring happens (planned second pass: daily re-fetch/re-parse for non-decided cases, one final fetch on decision).

**Status update (2026-09-22): Opinions Data panel's 8 term-stat reads materialized into their own table, plus a term toggle on that panel — both live.**

- **Materialization.** The Opinions Data panel used to call 8 functions in `src/lib/db/term-stats.ts`/`justice-stats.ts` (`getOpinionLengthStats`, `getJusticeAgreementGrid`, `getOpinionJoinerHighlights`, `getConcurrenceJoinMatrix`, `getDissentJoinMatrix`, `getTotalWordsByJustice`, `getMajorityMinorityRateByJustice`, `getJusticeStatsFromDb`) live on every render (this page revalidates hourly, so "every render" meant at most once an hour, not per visitor — the actual cost was mostly redundant cases/opinions re-fetching across 3 of the 8, not per-row expense; none of the 8 read enough rows to be genuinely heavy). Those 8 functions are **unchanged** and still individually queryable — they're just no longer called from the dashboard's render path. New `public.term_opinion_stats` table (migration `20260922000000_term_opinion_stats.sql`: `term`, `metric_type` [check-constrained to the 8 metric names], `payload` jsonb, `computed_at`, primary key `(term, metric_type)` — schema option A1 from that session's materialization investigation, i.e. term as a data column, not a table-per-term; same term-keyed/full-replace shape `justice_stats`/`lawyer_stats` already established, not a new pattern) is populated nightly by a new `scripts/compute-opinion-term-stats.ts` step in `daily-update.yml`, positioned after `fetch-opinion-authors.ts`/`compute-justice-stats.ts` (both must have already run) and before `compute-lawyer-stats.ts`. That step is `continue-on-error: true` at the workflow level *and* self-catches every error inside the script (per-term and at the top level) — a bug here can never block the daily commit. The script's reads reuse the anon-key-shaped `SUPABASE_PUBLISHABLE_KEY` env var `src/lib/db/client.ts` expects; since GitHub Secrets only provisions the service-role key for this workflow, the script falls back to that (a strict superset of anon-key read access, and this stays inside `scripts/`, exactly where a service-role key is supposed to live) rather than requesting a redundant second secret. The same script doubles as the one-time backfill via `--term <year>`/`--dry-run` flags (same "backfill is just this script's normal logic run once" precedent as `compute-justice-stats.ts`'s optional `[term]` arg) — OT2025 has been backfilled; OT2026 populates nightly with empty/zeroed rows until real opinions start landing.
- **Term toggle.** `scotusdashboard2-data.ts`'s opinions block now does one query (`db.from("term_opinion_stats").select("*").in("term", TRACKED_TERMS)`) instead of 8 live calls, unpacked into `opinionStatsByTerm: Record<term, OpinionTermStats>`. The panel's previously-static "2025-6 Term" text is now a real term selector — the same `TermFilter` component the All Cases panel already used, reused as-is except for a new `allowClear` prop (default `true`, unchanged for All Cases; `false` for this usage, since there's no "all terms merged" state that makes sense for opinion stats the way there is for a case list). Switching it re-renders every sub-view (Length, Alignment, Volume, Volume>Highlights, Justices, Joiners) from the already-fetched slice — zero additional Supabase round-trips, same pattern the All Cases term filter already used. A term whose row is empty/zeroed (OT2026 today) shows "No Opinions for Term {term}" in place of each sub-view's content instead of a broken- or blank-looking panel; a genuine fetch error still throws (same as every other `src/lib/db/*` accessor) rather than being folded into that empty state. The top-level `justices` prop (still live, current-term-only, via `getJusticeStatsFromDb()` with no term arg) is untouched and still feeds the separate "Justices" nav section (`JusticesSpeakingPanel`/`JusticesOpinionsPanel`) — only the Opinions Data panel's own internal per-justice opinion views (Volume/Highlights) became term-scoped, reading `opinionStatsByTerm[term].justiceStats` instead.

## Branch is deploy. Main is always green.

- **Merging to `main` does NOT deploy.** `vercel.json` sets `git.deploymentEnabled: false`, so a merge only updates the committed source — the live site at production only updates after a manual `vercel --prod` deploy runs as a separate step (see "Manual acts stay with Will" below). Treat a merge and a deploy as two different gates: never merge to `main` without an explicit human gate approval, and don't assume a merge is live until the manual deploy has actually run.
- **`vercel --prod` requires an explicit command from Will, every single time.** Claude Code may run it only when Will explicitly instructs it *in that session, in words* — e.g. "deploy now," "run vercel --prod," "go ahead and deploy." A push, a merge, all verification checks passing, or something adjacent like "looks good" is never sufficient on its own; do not treat any of those as authorization. Claude Code must never run it proactively after a push or merge, even if it believes the deploy is safe — and the authorization is session-scoped: an instruction to deploy given in a previous, separate session does not carry forward and does not authorize running it in a new one. When Will does give the explicit command, Claude Code should still surface anything it knows to be unverified or risky about the current state of `main` before running it — the explicit command authorizes the act, it does not waive the obligation to flag known risk. This exception is about what Claude Code is allowed to do when asked directly; it does not change `vercel.json`'s `git.deploymentEnabled: false`, which stays as-is (no auto-deploy on push, ever).
- All SCOTUS 2.0 work happens on the run's declared feature branch (Phase A/B: `feat/intelligence-layer`; Phase D: `feat/doctrine-surfaces`). Never commit directly to `main`.
- `main` must always build and deploy cleanly. If a change can't be proven safe on the branch, it doesn't merge.
- **Every** task states, in its hand-back, whether any file it touched would alter the daily GitHub Actions run. The orchestrator aggregates these into the merge gate.

## Session / orchestration protocol

- **One repo per run.** A run rooted here touches only this repo. No sub-agent reaches into the DYSTL repo, and no DYSTL-rooted session drives work here. If you are reading this while rooted in the DYSTL repo, stop — open a fresh session in this repo instead.
- **Investigation first, twice.** The orchestrator recons before dispatching; each sub-agent investigates its own change surface before writing. Confirm the real file paths in this repo — do not assume them from this document or from the DYSTL side.
- **Notion is the planning source of truth.** The orchestrator reads the master plan ("SCOTUS 2.0 — Strategy & Build Plan (CONSOLIDATED MASTER)") at the start of every run and resolves recorded checkpoints itself, logging each resolution and any deviation to the Run Log.
- **Model allocation:** Sonnet 5 by default. Opus reserved for the three highest-blast-radius tasks: **A2** (the bridge into the live daily cron), **B2** (the assessment engine), **C3** (the briefing prompt). B2/C3 are DYSTL-side; from this repo, A2 is the Opus task.
- **Manual acts stay with Will:** applying Supabase migrations, adding GitHub Secrets, and rotating the PAT. The orchestrator prepares these and stops at the relevant gate. (`--prod` deploys are Will's call too, but Claude Code may execute the command itself under the explicit-command exception in "Branch is deploy" above — see that section for exactly what does and doesn't count as authorization.)

## Protected paths — do not modify without a gate

The exact paths are confirmed at recon and corrected here in the same PR if this list drifts. As of the A0 recon, the protected surface is:

- **The daily pipeline / GitHub Actions workflow** that fetches case data and commits the daily JSON. The SCOTUS 2.0 outbound sync (A2) *adds to* this workflow; it must not change what the workflow already fetches, or the path/format of the daily JSON commit.
- **The committed daily data files** the public site renders from (the JSON the pipeline writes). Read them; don't restructure them.
- **The public rendering/routing** of the existing dashboard — as of 2026-08-31 that's `/welcome` and `/dashboard` (see "Root cutover" above), not the pre-cutover page tree. SCOTUS 2.0 adds no public pages to this repo in Phase A/B; Phase D adds *new* doctrine/split surfaces as additive routes without altering existing ones.
- **`main`**, always.

## The A2 rule (outbound sync into the live cron)

A2 is the one place SCOTUS 2.0 touches the beating heart of this repo, so it has its own guardrails, all from the master plan:

- The Supabase emit is **additive and non-fatal**: if the DYSTL Supabase write fails, the daily JSON fetch-and-commit path must complete **unaffected**. A sync failure can never break intake. Verify this explicitly.
- Ship behind the standard dry-run gate: the orchestrator runs the manual `workflow_dispatch` dry-run and presents results; **Will confirms before any merge to `main`.**
- The emit needs `SUPABASE_URL` and the DYSTL **service-role key** in GitHub Secrets. The orchestrator stops and asks Will to add these before the dry-run — it never hardcodes or echoes them.

## Secrets hygiene

- No tokens, keys, or secrets in code, config, or commit history. Supabase creds come from GitHub Secrets at runtime only.
- **Known issue for A0 to fix:** the git remote URL currently embeds a live GitHub token (`gho_…`). A0 cleans the remote so no token is stored in git config, and the run ends reminding Will to **rotate that PAT on GitHub**. Never reproduce the token value in output.

## Hand-back format (every task)

State: the branch worked on; the commits made; **explicitly whether any file would alter the daily GitHub Actions run**; and anything that deviated from the plan. The orchestrator collects these for the gate — individual tasks do not merge, deploy, or ask Will mid-run.
