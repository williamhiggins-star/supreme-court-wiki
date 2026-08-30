# Term stats — coding rules

Precise derivation rules for computing the SCOTUSblog term Stat Pack from
this schema. Written against the schema as of
`20260830100000_term_stats_schema.sql`. No parser or view code exists yet —
this document defines what a future computation layer must implement.

Two layers, kept separate throughout (see migration comment for why):

- **Vote/decision layer** — `decisions` (one row per case/person, a
  `position` of majority/plurality/concurrence/concur_dissent/dissent/
  recused/did_not_participate — 7 values, unchanged by this session's
  migration). Canonical for "what side was this justice on." `votes` is
  legacy and frozen — see §0.
- **Opinion layer** — `opinions` (kind, author_id, word_count) +
  `decision_ties` (one row per case/person/opinion: role author/joiner,
  join_scope full/partial). Canonical for "who wrote or joined what."

Side buckets used throughout this document, in terms of the real
`decisions.position` values (unchanged by this migration — see its design
decision #3): `concurrence_in_part` and `dissent_in_part` are *not*
`decisions.position` values. A concurrence-in-part author/joiner is
stored with `position = 'concurrence'`; a dissent-in-part author/joiner
is stored with `position = 'dissent'`. The distinct `opinions.kind`
values exist one layer down, for authorship bucketing (§10) and the
cross-check (§11), not at the position layer.

- **majority-side** = `decisions.position` in `('majority', 'plurality',
  'concurrence')`
- **dissent-side** = `decisions.position = 'dissent'`
- **not counted** = `('recused', 'did_not_participate')`
- **`concur_dissent` has no automatically-derived side.** Session 6 found
  real cases on both sides of this: in Trump v. Barbara, Feldman's own
  "Closely Divided Cases" table lists the case as 6-3 with only Thomas,
  Alito, and Gorsuch dissenting — Kavanaugh's `concur_dissent` opinion is
  majority-side there. In West Virginia v. B.P.J., Feldman's Voting
  Alignments grid shows the case as 6-3, not unanimous — Sotomayor,
  Kagan, and Jackson's `concur_dissent` opinions are dissent-side there.
  A blanket rule (this doc previously said `concur_dissent` is always
  dissent-side) gets one of these wrong no matter which way it's set.
  `decisions.position` must be set to whichever side (`majority` or
  `dissent`) the opinion substantively lands on for that specific case —
  a per-case judgment call, not a mechanical function of `opinions.kind`.
  `opinions.kind` stays `concur_dissent` either way; only the case-level
  `decisions.position` is case-specific. (Barbara and B.P.J. are now
  correctly set this way in the live data — see git history for the
  session that fixed them.)

## §0. votes vs. decisions — which is canonical

`decisions` is canonical. From `20260829120000_decisions.sql`:

> `decisions` — one row per (case, person): the resolved, single "what
> side" summary, computed with the same priority order as
> decisionSides.ts... Most queries (justice_stats, case pages) should
> read from here; decision_ties is for "show me exactly which opinion(s)".

> `votes` is NOT dropped or modified here — it stays exactly as today,
> untouched by the new write path. A separate migration will deprecate it
> once decisions/decision_ties are verified against a full backfill.

Every rule below reads from `decisions`/`decision_ties`, never `votes`.

`decisions.position` cannot currently represent "would deny" / "would
grant" (cert-stage dissents from denial). See §11.

## §1. Unanimous

A case is unanimous if no justice's `decisions.position` for that case is
`'dissent'`.

- 8–0 (one recusal/non-participation, no dissent): unanimous — the
  recused justice is simply absent from the majority-side count, doesn't
  affect the check.
- A per curiam (`opinions.kind = 'per_curiam'`) with no attached dissent
  opinion: unanimous.

**Resolved (Session 6):** the rule itself doesn't change — only
`position = 'dissent'` disqualifies — but per §0, `concur_dissent` no
longer has an automatically-derived side. West Virginia v. B.P.J. is the
worked example: Feldman's grid shows it as 6-3, not unanimous, so
Sotomayor/Kagan/Jackson's `concur_dissent` opinions there are set to
`position = 'dissent'` directly (not left at `concur_dissent`), and the
unanimity rule above catches it correctly as a result. A case where
`concur_dissent` is determined to be majority-side (e.g. Trump v.
Barbara) stays unanimous-eligible under this same literal rule, correctly,
since none of its concur_dissent authors are dissent-side there.

## §2. "Would deny" counts as dissent-side

**Cannot be computed — schema gap.** "Would deny/grant" is a cert-stage
concept (a justice publicly noting they would have granted a petition
the Court denied). There is no orders/cert-vote table, and
`decisions.position` only has merits-opinion values. See §11.

## §3. Closely divided

For a decided case, let `maj = count(distinct person_id)` where
`decisions.position` is majority-side, `dis = count(distinct person_id)`
where dissent-side (both scoped to `case_id`). Closely divided iff
`(maj, dis)` is one of `(5,4)`, `(5,3)`, `(6,3)`, `(6,2)`. (Totals below 9
are recusal/non-participation cases — already excluded from both counts
since `recused`/`did_not_participate` are in neither bucket.)

## §4. Ideologically split

Requires `justice_term_blocs` populated for the case's `term`. A case is
ideologically split iff the set of `person_id`s on the majority-side
exactly equals the set of justices with `bloc = 'conservative'` for that
term (from `justice_term_blocs`, restricted to justices who actually
participated — i.e. present in `decisions` for this case) AND the
dissent-side set exactly equals the `liberal` set for that term. Not "at
least N conservatives vs. at least N liberals" — an exact bloc-for-bloc
match, no crossover in either direction.

Participation must be scoped per case, not per full bloc: a bloc member
who is recused/did-not-participate for this case is excluded from both
the expected and actual sets for that comparison, or the case will never
match.

## §5. Agreement

Two justices "agree" on a case iff they're in the same side bucket
(majority-side vs. dissent-side, §3's definition) for that case —
regardless of which specific opinion each joined or authored.
Concurrence-in-judgment-only (stored as `decisions.position =
'concurrence'` — this schema has never split concurrence from
concurrence-in-judgment at the position layer, only at the
`opinions.kind` layer) counts as majority-side, i.e. agrees with the
majority author even when the concurrence's reasoning differs.

Per-pair agreement rate for a term = (cases where both participated and
agreed) / (cases where both participated) — the denominator excludes any
case where either justice is recused/did-not-participate.

## §6. Plurality cases are not their own split category

A case with a plurality opinion (`decisions.position = 'plurality'`) is
classified by §3/§4 exactly like any other case — plurality-side justices
count toward `maj` in §3 and toward the majority-side set in §4 like any
other majority-side justice. There is no separate "plurality case" bucket
for closely-divided/ideologically-split purposes; plurality only matters
for opinion-authorship stats (§9) and for the case's own display of who
wrote what.

## §7. Majority-frequency denominator

Per-justice majority frequency for a term = (cases with
`decisions.position` majority-side) / (cases participated in), where
"cases participated in" = count of `decisions` rows for that justice in
that term with `position` NOT in `('recused', 'did_not_participate')`.

**Data-completeness caveat, not a schema gap:** as of this migration,
nothing in the pipeline ever writes `position = 'recused'` or
`'did_not_participate'` (confirmed in `scripts/lib/sd-db/decisions.ts`'s
own comment: "Recusal is similarly unrepresented... the same gap already
present in the existing votes table"). Until that's fixed, "cases
participated in" will silently include cases a justice was actually
recused from, because the current write path defaults every unclassified
justice to majority-side (see §11 for why). This denominator is only as
good as that gets fixed — it's a data problem, not something this schema
addition changes.

## §8. Consolidated cases / circuit scorecard

A consolidated docket is one `cases` row with multiple
`case_lower_courts` rows (one per distinct lower court/docket it
combines). A circuit scorecard (affirm/reverse counts per circuit for a
term) is:

```
select clc.court_id, c.disposition, count(*)
from case_lower_courts clc
join cases c on c.id = clc.case_id
where c.term = $1
group by clc.court_id, c.disposition
```

`c.disposition` is scoped to the whole case, not per lower court — if a
consolidated case affirms one circuit's judgment and reverses another's,
this schema cannot represent that split (disposition lives on `cases`,
singular). That's an assumption, not verified against real consolidated-
case dispositions; flagging as a possible future gap rather than building
per-lower-court disposition now, since the brief listed `disposition` as
a `cases`-level field.

### §8a. Circuit-scorecard scoping (Session 9)

Verified against Feldman's actual "Circuit Scorecard" table (p.14) and
Term Index (p.23) for all 66 cases. Three rules his table applies that
this schema does NOT enforce automatically — a consumer building a
Feldman-comparable scorecard must apply these itself:

1. **"U.S. Courts of Appeals" only** — Feldman's own description text
   limits the table to circuit-court-origin cases. `case_lower_courts`
   rows exist for every case regardless of court type (state supreme,
   state appellate, federal district, federal appellate), so a
   Feldman-style scorecard must filter to `courts.level =
   'federal_appellate'`. Confirmed excluded: Case (Montana Supreme
   Court), Galette (Pennsylvania Supreme Court), Villarreal (Texas Court
   of Criminal Appeals), Monsanto (Missouri Court of Appeals, Eastern
   District), Callais (W.D. Louisiana — a direct three-judge-panel
   appeal, never touches a circuit court), District of Columbia v. R.W.
   (D.C. Court of Appeals — the *local* D.C. court, distinct from the
   federal D.C. Circuit), Doe v. Dynamic Physical Therapy (Louisiana
   Court of Appeal), Pitts v. Mississippi (Mississippi Supreme Court).
2. **DIG cases are fully omitted, not counted as "reversed."** Feldman's
   own footnote: "Decisions that were granted review but subsequently
   dismissed (as improvidently granted) are omitted." Hamm v. Smith
   (`disposition = 'dismissed_as_improvidently_granted'`) deliberately
   has **no** `case_lower_courts` row — that's how it's excluded from
   scorecard queries cleanly (a query grouping through `case_lower_courts`
   never sees it), rather than relying on every future query to
   remember to filter out DIGs by disposition value.
3. **Trump v. Cook (25A312)** is an emergency-docket stay denial, not a
   merits disposition — per Feldman's own footnote (3), it's "treated
   here as having Affirmed CADC." Recorded that way (`disposition =
   'affirmed'`) to match his convention, not because a stay denial is
   literally an affirmance.

**Consolidated companions**, per Feldman's footnote (4) — a proceeding
can span two circuits, each getting its own `case_lower_courts` row
under the one `cases` row: FCC v. AT&T (primary CA5, docket 25-406) +
companion CA2, docket 25-567. West Virginia v. B.P.J. (primary CA4,
docket 24-43) + companion CA9, docket 24-38 (*Little v. Hecox*).
Learning Resources v. Trump (primary CADC, docket 24-1287) + companion
CAFED, docket 25-250 (*Trump v. V.O.S. Selections*). Mullin v. Doe
(primary CA2, docket 25-1083) + companion CADC, docket 25-1084 — note
this one is *not* a district-court case; an earlier pass mis-sourced its
primary lower court as S.D.N.Y. from a SCOTUSblog summary that
conflated where suit was filed with whose judgment SCOTUS reviewed.
Corrected this session.

**Known near-miss, not force-fixed: CADC.** Every individual CADC entry
(Learning Resources, Slaughter, IAM Pension Fund, Cook, Exxon, Mullin's
companion) was checked against a primary source and each is
individually correct, yet the aggregate reads 6 decided / 3 affirmed / 3
reversed against Feldman's stated 6/2/4. The likely culprit is Learning
Resources: its real disposition is genuinely non-binary — SCOTUS
*affirmed* the Federal Circuit in the consolidated companion (V.O.S.
Selections) while *vacating the district court* (not the D.C. Circuit)
on jurisdictional grounds in the Learning Resources docket itself. That
messiness is exactly the "disposition can't represent a per-part split"
limitation flagged above, materializing in a case that also happens to
be the same fractured-opinion case already known from the authorship-
count dedup (§10a). Rather than guess which entry to flip to force a
match, this is left as a documented, understood discrepancy — CADC will
read 6/3/3 against Feldman's 6/2/4 until someone determines the correct
treatment with more certainty than a Term Index single-letter code can
provide.

## §9. Days to decision

Only for argued cases: `decided_date - argued_date`, computed only when
both `cases.argued_date` and `cases.decided_date` are non-null. Cases
decided without argument (cert denials, DIGs, GVRs, most `sitting =
'no_argument'` cases) have no days-to-decision figure — do not fall back
to some other date.

## §10. Concurrence-in-part / dissent-in-part authorship bucketing

For per-justice "opinions written" totals (majority / concurring /
dissenting / concur-dissent counts), bucket by `opinions.kind` via
`decision_ties` (role = 'author'):

- `concurrence`, `concurrence_in_judgment`, `concurrence_in_part` → all
  count toward the "concurrences written" total.
- `dissent`, `dissent_in_part` → both count toward the "dissents
  written" total.
- `concur_dissent` → its own "concur/dissent opinions written" total, as
  today.
- `majority`, `plurality` → their own respective totals, as today.

This is a proposed convention (SCOTUSblog's own Stat Pack categories
weren't cross-checked against this repo's data), not a fact already
encoded anywhere — confirm before wiring a view to it.

`decisions.position` (§0's note 3 in the migration) deliberately does NOT
split `concurrence_in_part`/`dissent_in_part` into their own position
values — that split only matters for this authorship count, which reads
`opinions.kind` directly, not `decisions.position`.

### §10a. Authorship-count deduplication (Session 7)

A single author can have **multiple `opinions` rows for the same
`case_id`** — a fractured opinion split into distinct parts commanding
different coalitions (e.g. majority as to most Parts, plurality-only as
to one or two others). Confirmed twice in this dataset: Learning
Resources v. Trump/Roberts and Barrett v. United States/Jackson, both
`['majority', 'plurality']` for the same author.

For the authorship-**count** stat specifically (the "N total opinions"
headline, not word-count/decision_ties/voting-alignment, which correctly
read every row), these must be deduplicated to **one opinion per
(case_id, author_id)**, bucketed under the higher-authority kind — this
is how Feldman's own "Opinions Authored by Each Justice" table counts
them (verified directly against the rendered PDF: both Roberts/Learning
Resources and Jackson/Barrett appear exactly once, under Majority only,
in his table).

Priority order for which kind wins when an author has 2+ rows for one case:

- **`majority > plurality`** — **empirically verified**, 2/2 real
  instances in this dataset (Roberts/Learning Resources,
  Jackson/Barrett v. United States), both cross-checked directly
  against Feldman's rendered table.
- **`per_curiam > concur_dissent > concurrence > concurrence_in_judgment
  > concurrence_in_part > dissent > dissent_in_part`** — a **provisional
  best-guess extrapolation only**, not verified against any real case in
  this dataset (no author currently has 2+ opinion rows in one case
  exercising any pairing beyond majority/plurality). Treat as a
  placeholder ordering by rough controlling-authority intuition, not a
  confirmed fact — revisit and confirm against Feldman's table the next
  time a case actually exercises it, rather than assuming this order
  holds.

This is a counting-layer rule only. `opinions`/`decision_ties` rows are
never merged, deleted, or otherwise touched — the multi-row structure is
correct and stays intact for every other stat that needs fragment-level
detail (who joined which specific Part).

## §11. Vote-side-derivation cross-check

The ask: derive each justice's vote-side purely from `decision_ties` +
`opinions.kind` (author + joiner rows, majority-side kinds vs.
dissent-side kinds), then compare against the stored `decisions.position`
for that justice/case. Where they disagree, flag it — never overwrite
`decisions` with the derived value, and never overwrite the derived
value with `decisions` either. Surface both.

**This cannot be done reliably today, structurally, not just a data
problem:**

`computeDecisionSides` (`src/lib/decisionSides.ts`, consumed by
`scripts/lib/sd-db/decisions.ts`) assigns every justice not otherwise
placed to the majority bucket by exclusion, iterating a hardcoded
9-name roster (`JUSTICE_ORDER`) — it does not require an explicit
"joined the majority" row. So a "silent majority" justice — one who
authored nothing and appears in no `joinedBy` list for this case — gets
a `decisions` row with `position = 'majority'` and `primary_tie_id =
null`, and has **zero rows in `decision_ties`**. A pure `decision_ties` +
`opinions.kind` query cannot recover that justice's side at all; they're
indistinguishable from a justice who simply has no data for this case.

Two consequences for the cross-check:

1. It can only meaningfully verify justices who DO have a `decision_ties`
   row (dissent/concur_dissent/plurality/concurrence authors and named
   joiners) — for those, derived-side = majority-side if
   `opinions.kind` in `('majority','plurality','concurrence',
   'concurrence_in_judgment','concurrence_in_part')`, dissent-side if in
   `('concur_dissent','dissent_in_part','dissent')`, and this should
   match `decisions.position`'s bucket exactly; a mismatch here is a real
   flag.
2. For a justice with a `decisions` row but no `decision_ties` row at
   all, "derived side" isn't computable from the join graph — it can
   only be inferred as "whoever's left over," which requires knowing the
   full sitting roster for that case, not just who's mentioned in its
   opinions.

**The roster piece is not actually missing from the schema** —
`judgeships` (court_id = the SCOTUS courts row, `start_date`/`end_date`)
already lets you compute who was sitting on a given `decided_date`. The
problem is that `computeDecisionSides` doesn't use it; it uses a
hardcoded 9-name list of the *current* Court, which is wrong for any
`historic` case with a different bench. That's a pipeline defect, not a
schema one, and it's out of scope this session (no parser changes) — but
it means: until that's fixed, do not trust the "silent majority by
exclusion" derivation for anything but the current 9 justices' cases, and
never for recusal detection (a recused justice and a silently-majority
justice currently look identical: no `decision_ties` row, no explicit
`decisions` row distinguishing them — worse, an actually-recused justice
today gets folded into "majority" by the same exclusion logic, per its
own code comment quoted in §7).

**What the check should do once implemented (next phase):** for each
case/justice, if a `decision_ties` row exists, compare its derived side
to `decisions.position`'s bucket and flag any mismatch. For
justices with a `decisions` row but no `decision_ties` row, flag them
separately as "unverifiable by join data" rather than silently trusting
`decisions.position` — that's a distinct condition from "verified
match" and from "verified mismatch," and collapsing it into either would
misrepresent how much the check actually confirmed.

**Implemented** (Phase 2) as `term_stats_vote_side_cross_check`: a
`check_status` of `match` / `mismatch` / `unverifiable_no_decision_ties_row`
per case/justice, exactly as specified above. Not used to overwrite
`decisions`; surfaced as its own view.

## §12. Per-case voting alignment grid (Phase 2 addition)

Not one of the original 11 rules — added for Phase 2's
`term_stats_voting_alignment_grid` view. The requested 4 categories are
a **display** grouping, a different granularity from the majority-
side/dissent-side split used everywhere else in this document:

- `majority` — full agreement with the result: `decisions.position` in
  `('majority', 'plurality', 'concurrence')` (the last one covers both
  plain concurrence and concurrence-in-judgment, since neither is split
  out at the position layer — §0).
- `partial_concurrence` — qualified agreement: `position = 'concur_dissent'`.
- `dissent` — full dissent: `position = 'dissent'`.
- `did_not_participate` — `position` in `('recused', 'did_not_participate')`.

**Known limitation:** because `concurrence_in_part`/`dissent_in_part`
aren't split out at the position layer (design decision #3), a
concurrence-in-part author is stored as plain `'concurrence'` and lands
in the `majority` bucket here, not `partial_concurrence` — even though
"concurring in part" reads more like the latter. This is a direct
consequence of §0's bucket definitions, not a bug in this view; revisit
if the grid needs that distinction.

## §13. Term index by sitting (Phase 2 addition)

Not one of the original 11 rules — added for Phase 2's
`term_stats_sitting_index` view. Read as: case counts (total and
decided) per term, grouped by `cases.sitting`. Cases with no `sitting`
set are excluded, not bucketed into an "unknown" row.

## §14. Opinion word counts (backfilled from slip-opinion PDFs)

`opinions.word_count` is populated by `scripts/backfill-opinion-word-counts.ts`,
which downloads each decided OT2025 case's slip-opinion PDF, segments it
into per-opinion text blocks on the Reporter of Decisions' own
page-1-reset boundary (each new opinion restarts page numbering at 1),
matches each `opinions` row to its block by author surname (or, for a
named joiner with no independently-headed text of their own — e.g.
Jackson joining Sotomayor's B.P.J. concur/dissent — by the "with whom ...
join(s)" clause), and writes the cleaned word count. Validated by hand
against Feldman's Stat Pack case-level and per-justice figures before
being written (9-justice + per curiam averages within ±2% of Feldman's
own "≈" numbers for 8 of 10; see below for the two exceptions).

**§10a extended to word_count:** when one author has multiple `opinions`
rows for the same case (the existing majority/plurality fractured-opinion
pattern), only the highest-priority kind gets a real `word_count` — the
lower-priority row(s) are written explicitly to `null`, not left to
whatever the extractor happens to match, since it's the same physical
text as the row that does carry the count. As of this backfill that's
exactly 2 rows: Roberts' plurality row in *Learning Resources v. Trump*
and Jackson's plurality row in *Barrett v. United States*.

### §14a. Cert-stage "would deny/grant" notations are never an opinions row

**General rule:** when a per curiam summary disposition ends with "It is
so ordered." followed by a line like "JUSTICE X[, JUSTICE Y, and JUSTICE
Z] would deny [or grant] the petition for a writ of certiorari" — this is
a **cert-stage voting notation**, not a written opinion. It must never be
modeled as an `opinions` row of any `kind` (including `dissent`), because
there is no opinion text behind it to ever populate `word_count` with.
The named justice(s)' disagreement belongs solely in
`decisions.position` (already correctly set to `'dissent'` in every case
found), which is deliberately independent of `opinions`/`decision_ties`
per design decision §0/#4 above (cert-stage voting is out of scope for
this schema, tracked at the position layer only, not given its own
table).

Two live rows matched this exact pattern and were fixed this session
(both approved; both DELETEs executed successfully, confirmed by
re-query — the earlier session's report of the first being blocked by
the permission classifier did not recur on retry):

- ***District of Columbia v. R.W.*** — deleted the spurious Sotomayor
  `dissent`-kind row (id `4931175f-0a9a-4fea-9d70-34fcbaa519f7`,
  `decision_ties` role `'author'`). Its `decision_ties` row cascaded
  automatically. Remaining: the per curiam row and Jackson's real,
  separate, multi-page dissent — confirmed by direct query.
- ***McCarthy v. Hernandez*** — deleted the authorless `dissent`-kind row
  (id `4c327961-6286-42c9-8c06-3cb5022591e5`, `author_id = null`, three
  `decision_ties` rows all `role='joiner'`: Sotomayor, Kagan, Jackson —
  text: "JUSTICE SOTOMAYOR, JUSTICE KAGAN, and JUSTICE JACKSON would deny
  the petition for a writ of certiorari"). Its 3 `decision_ties` rows
  cascaded. Remaining: exactly the one per curiam row, no dissent —
  confirmed by direct query.

In both cases `decisions.position='dissent'` was left untouched for the
named justices, since it's tracked independently and already correct.

A full-text search for `would deny`/`would grant` across all 66 cached
OT2025 slip opinions found one more real instance of the pattern —
***Klein v. Martin*** ("JUSTICE JACKSON would deny the petition for a
writ of certiorari") — but **no fix was needed there**: Klein v. Martin
has only its one legitimate `per_curiam` row; no spurious `dissent`/
opinion row was ever created for it, and `decisions.position='dissent'`
for Jackson is already correct on its own. No other case in the 66
matched the pattern (the remaining `would deny`/`would grant` hits found
by the search were ordinary prose — "would deny equal opportunity...",
"would grant the application..." in a stay-application dissent, etc. —
not cert-stage notations).

### §14b. Abouammo v. United States had the wrong slip opinion — root cause found and fixed

While investigating the Klein v. Martin match, found that
`data/cases/25-5146-ahmad-abouammo-v-united-states.json`'s `outcome`
field had pointed to **Klein v. Martin's PDF**
(`.../25pdf/25-51_4g15.pdf`) since before this session, which the
word-count backfill inherited and propagated (Abouammo's `word_count`
briefly matched Klein's almost exactly — 3808 vs. 3813 — before this
was caught and reverted to `null`).

**Root cause, confirmed reproducible:** `findCaseFile()` in
`fetch-opinion-authors.ts` matched a scraped docket number to a
`data/cases/*.json` file with a bare `f.startsWith(prefix)`, no boundary
check. Klein v. Martin's real docket is `25-51`, which has no JSON file
of its own (one of the session-4 backfilled cases). But
`"25-5146-ahmad-abouammo-v-united-states.json".startsWith("25-51")` is
`true` — "5146" happens to start with "51" as digits — and since
Abouammo's file is the *only* existing file matching that prefix, this
match was deterministic, not a fluke. Whatever process parsed Klein's
real slip opinion wrote its authorship/outcome data into Abouammo's file
instead. **Fixed**: `findCaseFile()` now also requires the character
right after the matched prefix to be `-` or end-of-string, so a docket
number can never match as a mere string-prefix of an unrelated longer
docket.

Checked for other live collisions across the full 66-case set (every
real docket number tested as a string-prefix of every filename): one
other latent case exists — `25-5` (Noem v. Al Otro Lado) is also a
prefix of Abouammo's and Whitton's filenames — but Noem has its own
correctly-named file, which wins the match ahead of Abouammo's under
normal alphabetical directory order, so no corruption occurred there.
**No other case in the 66 was actually affected**; no further re-audit
needed.

**Full fix applied, DB-first per the site's current dual-write
architecture** (the DB is the priority since it's what a future
Supabase-backed read path would serve; the JSON fix is secondary but
applied too since it was cheap and there's no reason to leave it wrong):

- Found Abouammo's real docket PDF (`.../25pdf/25-5146_new_kifl.pdf`,
  decided 2026-06-11) via the live SCOTUS slip-opinions listing, and
  cross-checked it against Feldman's own Term Index (March sitting:
  Kagan, 9-0, 74d, Reversed, CA9) — exact match. The real case is a
  §1519 venue question (Twitter/Saudi-official leak investigation), not
  the fabricated "extraterritorial jurisdiction" framing still sitting
  in `question_presented`/`background`/`significance` (see below).
- `cases` row: `decided_date` → `2026-06-11`, `argued_date` →
  `2026-03-30` (was `null` — a separate, pre-existing gap unrelated to
  the Klein mixup), `vote_line` → `'9-0'`, `disposition` →
  `'reversed_and_remanded'` (upgraded from the less-precise `'reversed'`
  already independently, correctly set by the circuit-scorecard
  session's own research — not itself Klein-contaminated).
- `opinions` row (id `eff3c122-8329-4a9e-b815-dcbbcaddc959`): `summary`
  replaced with real content about the §1519 venue holding;
  `word_count` recomputed from the real PDF via
  `backfill-opinion-word-counts.ts` → `2799` (author `f2ed161d` = Kagan
  and `kind='majority'` were already correct — coincidentally, since the
  real case also happens to be unanimous and Kagan-authored — as were
  every `decisions`/`decision_ties` row and `case_lower_courts`, so none
  of those needed touching).
- `data/cases/25-5146-ahmad-abouammo-v-united-states.json`: `outcome`,
  `decisionDate`, `majorityOpinionSummary`, `petitionerWon` corrected to
  match.

**Still not fixed, flagged separately, not part of this bug**: the
fabricated pre-argument content — `question_presented`/`background`/
`significance` (DB) and `legalQuestion`/`backgroundAndFacts`/
`significance`/`parties`/`citedPrecedents`/`legalTermsUsed` (JSON) —
describes an "extraterritorial jurisdiction over a foreign national"
theory that has nothing to do with the real §1519 venue case
(`processedAt: 2026-02-24`, before the March 30 argument — this content
was seeded before decision and never corrected). This is a different,
larger problem than the outcome/PDF mixup (there's no wrong-but-real
source PDF to blame — it reads as fabricated/hallucinated intake
content) and needs its own investigation.

## §15. McCarthy v. Hernandez: `decisions` rows missing for cert-notation-affected justices (fixed); D.C. v. R.W. has the same gap (not fixed)

While investigating why `term_stats_ideological_split_rate` read 21.2%
(14/66) instead of Feldman's own Stat Pack figure of 22.7% (15/66), diffed
our 14 ideologically-split cases directly against the 15 cases Feldman's
"Closely Divided Cases" table names for that exact row (confirmed by
extracting the real PDF text, not a secondhand description) — every name
matched except one: **McCarthy v. Hernandez**. (Barbara, initially
suspected, was ruled out directly: Feldman's PDF shows it as its own
separate 1.5%-row case, never summed into the 22.7% figure at all.)

Root cause: `decisions.position` for McCarthy had only 6 rows, all
`majority` — Sotomayor, Kagan, and Jackson had **no `decisions` row at
all** (not a wrong position, an absent one), so `term_stats_case_splits`
saw `dissent_count=0` and wrongly flagged the case `is_unanimous=true`.
This also fully explained a second, previously-unexplained discrepancy in
the Feldman suite: `unanimity_rate` read 45.5% (30/66) instead of the
expected 43.9% (29/66) — same single missing case, both numbers.

Confirmed this predates §14a's cert-notation-opinion-row deletion (the 6
remaining rows all carry the *original* session-5/6 backfill timestamp,
never touched since) — the original backfill populated `decision_ties`
(3 "joiner" rows tied to the bogus dissent `opinions` row §14a later
deleted) but never separately populated the corresponding
`decisions.position` rows for those same 3 justices. Two different
tables, one populated at backfill time, the other silently skipped.

**Fixed**: inserted 3 `decisions` rows for McCarthy v. Hernandez
(Sotomayor, Kagan, Jackson, all `position='dissent'`, `primary_tie_id`
null — matching the case's 6 existing rows' shape). Confirmed both
`ideological_split_rate` (22.7%, 15/66) and `unanimity_rate` (43.9%,
29/66) now match Feldman exactly; re-ran the full Feldman suite and
confirmed every other line shows only the expected +1/+3 shifts from
these 3 new rows (same verdict as before on every other check — nothing
else regressed).

**Not fixed — same pattern, different case, logged so it isn't lost**:
D.C. v. R.W. has the identical gap. Its `decisions` table has only 8
rows (Jackson's real dissent + 7 majority) — **Sotomayor is missing
entirely**, same root cause (she was only ever linked via the bogus
"would deny the petition" `opinions`/`decision_ties` rows §14a deleted,
never given her own `decisions.position` row). D.C. v. R.W. is not one
of Feldman's 15 named ideologically-split cases, so this gap doesn't
affect `ideological_split_rate` or `unanimity_rate` — but it does mean
Sotomayor is silently undercounted in her own `cases_participated` and
majority-frequency denominators (`term_stats_majority_frequency`,
`term_stats_agreement`) for this one case. Deliberately not fixed this
pass — scoped as its own follow-up: insert one `decisions` row
(Sotomayor, `position='dissent'`, `primary_tie_id` null) for D.C. v.
R.W., the same way McCarthy's was fixed above, once someone picks it up.
Worth checking whether any other of the 11 backfilled-straight-to-DB
cases have the same silent gap before assuming it's just these two.
