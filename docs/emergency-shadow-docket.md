# The "emergency/shadow docket" table

"Emergency docket" and "shadow docket" are press terms, not the Court's.
The Court's term is **application** (Rules 22–23; docket numbers like
`26A476`). The site keeps the two apart:

| Table | What it is | Built from |
|---|---|---|
| `application_details` | Every application, in the Court's terms: caption, verbatim filing entry, type and outcome codes (`court_vocabulary`), the Justice it was submitted to, lower court, docket entries, docket link. Routine extensions of time stay here. | The Court's docket pages, by `scripts/read-applications.ts`. |
| `court_actions` (rows with an `A` docket number) | The Court's actions on each application: referral, response requested, administrative stay, grant, denial, deferral and so on, in the Court's words. | The same docket pages. |
| `emergency_shadow_docket` | The applications the press and public may mean by that phrase, plus related matters, with the Court's own terms alongside. Deliberately broad. | `application_details`, by the rule below. |

All three are pipeline-only: visitors have no access to them.

**On the site:** the dashboard's Shadow Docket section reads the view
`emergency_shadow_docket_public` (migration `20261024000000`). That view is
the only public way in. It returns only rows with `public_view = yes` and
only these columns:
- docket number and the Court's docket link;
- caption;
- type code and the Court's wording of what was asked for;
- the Justice it was directed to;
- filing date;
- pending;
- outcome code;
- lower court and case numbers, used for search only.

Never exposed: `rule_version`, `built_at`, `public_view`, the hand-set
marker, docket entries, outcome text, and anything about attorneys.

## public_view

A matter is either in `emergency_shadow_docket` or not. Each row also has
one yes/no column, **`public_view`**, which says whether the matter is part
of what will be shown publicly.

`public_view` is an **editorial setting**. It is not a judgment about what
is or isn't "shadow docket". The table is meant to over-include, and
`public_view` is where the choice of what to show is made.

- **Set automatically:** for every new row, and again whenever a row's
  application is reclassified (e.g. it enters as bail and later becomes a
  stay). No manual step is needed.
- **Hand edits:** anyone can write `public_view` on a row, even writing the
  same value to confirm it. A database trigger then marks that row
  `public_view_set_by_hand = true`, automatically.
- **Hand edits are never overwritten.** For a marked row:
  - the nightly update and the full rebuild refresh the facts only;
  - the row stays even if it would no longer qualify.

  The pipeline never writes `public_view` in an update. New and
  reclassified rows are inserted, so the rule's value is never mistaken
  for a hand edit.
- **Handing a row back to the rule:** set `public_view_set_by_hand = false`
  on it. The next full rebuild then applies the rule's value.

## Rule `esd-rule-2` (current, from 2026-10-20)

Applied to each application's type and the Court's own filing wording
(`scripts/lib/applications/membership.ts`):

- **In the table, `public_view` yes:** applications for interim relief.
  - a stay, partial stay or stay of execution;
  - an injunction;
  - vacatur of a stay or injunction;
  - recall and stay of a mandate.
- **In the table, `public_view` no:**
  - bail;
  - an extension of time to comply with an order;
  - leave to exceed word or page limits;
  - a certificate of appealability.
- **Not in the table:** routine extensions of time to file a petition,
  jurisdictional statement, reply brief or rehearing petition. They stay in
  `application_details`.
- **Review list:** anything else, including `vacate` of something other than
  a stay or injunction. It stays out of the table until the rule covers it.

The application type comes from the Court's filing entry, e.g. "Application
(26A476) **for a stay**, submitted to The Chief Justice.", through fixed
patterns in `scripts/lib/applications/parse.ts`. No LLM is involved, and
wording no pattern matches is never guessed.

### Previous version: `esd-rule-1` (2026-10-20, first build)

The table held only the interim-relief group above, and there was no
`public_view`. Bail and the wordings now marked "public_view no" were listed
as unclassified and kept out.

## Nightly update vs. full rebuild

**Nightly update (automatic).** At the end of every application-reader run:
- adds a row for each new qualifying application, with `public_view` from
  the rule;
- when an application changed (status, outcome, the Court's text,
  classification), replaces its row, so `public_view` follows the rule
  again;
- rows set by hand only get their facts refreshed;
- removes rows that no longer qualify, unless a person set them by hand.

A night with no new or changed applications writes nothing.

**Full rebuild (manual only).** Run `npx tsx
scripts/rebuild-emergency-shadow-docket.ts` on purpose, typically after a
new rule version:
- regenerates every row from `application_details`;
- rows set by hand keep their `public_view` and only get their facts
  refreshed;
- it gives the same result every time from the same base records.

Neither makes requests to the Court.
`npx tsx scripts/read-applications.ts --reclassify` re-applies the reader's
patterns to stored records, then runs the nightly update. Use it after
changing `parse.ts`.

## The review list

**After every reader run:**
- each application added or changed that night that the rule can't place
  becomes a `::warning` on the GitHub run ("Application needs review");
- the whole list is printed;
- the list is logged in `ingest_runs`:

```sql
select started_at, stats->>'mode' mode, stats->>'rule_version' rule,
       jsonb_array_length(stats->'inserted') added, jsonb_array_length(stats->'updated') updated,
       jsonb_pretty(stats->'review') review
from ingest_runs where stats->>'job' = 'emergency_shadow_docket'
order by started_at desc limit 1;
```
