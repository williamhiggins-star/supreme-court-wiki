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

**Root cutover (2026-08-31): the new UI is now the live site, not a side exception.** What used to be described here as a narrowly-scoped `scotusdashboard2` exception on the `ui-redesign` branch has since been merged to `main` and deployed to production — the old JSON-rendered homepage and its whole page tree (`/`, `/cases/[slug]`, `/precedents*`, `/terms*`, `/appeals`, `/appellate-impacts`, `/analysis`, `/docket/[column]`) are **deleted**, not just superseded. The live site today is two routes: `/welcome` (entry carousel) and `/dashboard` (the app itself — root `/` redirects to `/welcome`; `/cases/:slug` and `/docket/:column` redirect into `/dashboard`, everything else 404s). `/dashboard` reads live, in its render path, from a **third** Supabase project — "SCOTUS Dashboard" (ref `enwjtgjycthjypeqdgfo`; **not** DYSTL's project, ref `bclgsfgcdxxfayonynvl`) — built across many sessions as this repo's own read layer for term statistics (`decisions`, `opinions`, `key_exchanges`, `oral_argument_transcripts`, `case_podcast_episodes`, the `term_stats_*` views — see `docs/term-stats-coding-rules.md`). `src/lib/db/*.ts` is the accessor layer for it. This remains scoped to that one Supabase project — DYSTL's Supabase is still never read by the site — but it is no longer scoped to a side branch or an unused route; it **is** the production render path now. See `ARCHITECTURE.md` for the full current route/data map, including which `data/*.json` files are still rendered directly (`calendar.json`, `articles.json`, `circuit-splits.json`) versus pipeline-output-only now (`cases/*.json`, `precedents/*.json`, `terms/*.json`, `justices.json`, `lawyers.json`, `appellate-impacts.json` — still written and read by pipeline/backfill/parity scripts, just no longer rendered anywhere).

**Do not "fix" the undefined `--tan`/`--cream`/etc. CSS custom properties in `src/app/globals.css`.** They're referenced throughout the new UI's components but never defined — that's intentional, confirmed with Will (2026-08-31): the fallback rendering that produces is the actual intended look, and defining them to the brand doc's hex values would restyle the live site, not fix a bug.

## Branch is deploy. Main is always green.

- **Merging to `main` does NOT deploy.** `vercel.json` sets `git.deploymentEnabled: false`, so a merge only updates the committed source — the live site at production only updates after someone runs a manual `vercel --prod` deploy as a separate step (see "Manual acts stay with Will" below). Treat a merge and a deploy as two different gates: never merge to `main` without an explicit human gate approval, and don't assume a merge is live until the manual deploy has actually run.
- All SCOTUS 2.0 work happens on the run's declared feature branch (Phase A/B: `feat/intelligence-layer`; Phase D: `feat/doctrine-surfaces`). Never commit directly to `main`.
- `main` must always build and deploy cleanly. If a change can't be proven safe on the branch, it doesn't merge.
- **Every** task states, in its hand-back, whether any file it touched would alter the daily GitHub Actions run. The orchestrator aggregates these into the merge gate.

## Session / orchestration protocol

- **One repo per run.** A run rooted here touches only this repo. No sub-agent reaches into the DYSTL repo, and no DYSTL-rooted session drives work here. If you are reading this while rooted in the DYSTL repo, stop — open a fresh session in this repo instead.
- **Investigation first, twice.** The orchestrator recons before dispatching; each sub-agent investigates its own change surface before writing. Confirm the real file paths in this repo — do not assume them from this document or from the DYSTL side.
- **Notion is the planning source of truth.** The orchestrator reads the master plan ("SCOTUS 2.0 — Strategy & Build Plan (CONSOLIDATED MASTER)") at the start of every run and resolves recorded checkpoints itself, logging each resolution and any deviation to the Run Log.
- **Model allocation:** Sonnet 5 by default. Opus reserved for the three highest-blast-radius tasks: **A2** (the bridge into the live daily cron), **B2** (the assessment engine), **C3** (the briefing prompt). B2/C3 are DYSTL-side; from this repo, A2 is the Opus task.
- **Manual acts stay with Will:** applying Supabase migrations, adding GitHub Secrets, rotating the PAT, and any `--prod` deploy. The orchestrator prepares these and stops at the relevant gate.

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
