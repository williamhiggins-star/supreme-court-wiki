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
        └─ commits data/*.json ──► public site renders (no DB, ever)
                                            │
                                            ▼
                                   DYSTL analysis + briefings
                                   consume the mirrored data
```

Nothing flows back from DYSTL into **this repo**. The intelligence layer's outputs — doctrine signals, standing assessments, assessment versions — are written to DYSTL's Supabase, never committed here. This repo does not import DYSTL analysis and does not change how it renders because of DYSTL.

**Render and pipeline are separate surfaces, and the Supabase boundary applies to them differently:**

- **(a) The public site never touches DYSTL Supabase.** It renders from flat committed JSON in this repo, with no runtime database dependency of any kind (locked decision 4, unchanged). New Phase D surfaces render from a pipeline-written `data/doctrines.json`, not from a live query.
- **(b) The daily pipeline may read and write DYSTL Supabase** as part of the intelligence layer — the outbound mirror (A2), the analysis-feed sync (S1), event classification against doctrine indicators (B1), the assessment engine (B2), and embeddings (B4). These are pipeline steps, not render paths, and their reads exist to produce writes that land in DYSTL.

The distinction is the whole rule: **a database read is allowed in the pipeline and forbidden in the render path.** If a change would put a Supabase call anywhere the site's request path can reach it, that is out of scope and must be raised at a gate.

**If a task in this repo would change intake behavior, the daily commit, or how the public site renders, stop and flag it — that is out of scope for SCOTUS 2.0 and must be raised at a gate.**

## Branch is deploy. Main is always green.

- **Merge to `main` = production deploy.** There is no separate release step. Never merge to `main` without an explicit human gate approval.
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
- **The public rendering/routing** of the existing dashboard. SCOTUS 2.0 adds no public pages to this repo in Phase A/B; Phase D adds *new* doctrine/split surfaces as additive routes without altering existing ones.
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
