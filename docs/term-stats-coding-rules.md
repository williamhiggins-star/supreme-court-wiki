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
