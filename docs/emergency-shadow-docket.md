# The "emergency/shadow docket" grouping

"Emergency docket" and "shadow docket" are press terms, not the Court's.
The Court's term is **application** (Rules 22–23; docket numbers like
`26A476`). The site keeps the two apart:

| Table | What it is | Built from |
|---|---|---|
| `application_details` | Every application, in the Court's terms: caption, verbatim filing entry, type and outcome codes (`court_vocabulary`), the Justice it was submitted to, lower court, docket entries, docket link. | The Court's docket pages, by `scripts/read-applications.ts`. |
| `court_actions` (rows with an `A` docket number) | The Court's actions on each application: referral, response requested, administrative stay, grant, denial, deferral and so on, with the Court's words. | The same docket pages. |
| `emergency_shadow_docket` | The applications the press and public mean by "emergency/shadow docket", with the Court's own terms alongside. | `application_details`, by the rule below. Rebuilt in full every run. |

All three are pipeline-only: no anon access, and nothing on the site reads them.

## Rule `esd-rule-1`

Applied to `application_details.application_type` (`scripts/lib/applications/membership.ts`):

- **In: interim relief.**
  - `stay`
  - `partial_stay`
  - `stay_of_execution`
  - `injunction`
  - `recall_and_stay_mandate`
  - `vacate`, but only when it vacates a stay or an injunction.
- **Out: routine extensions of time.**
  - `extension_cert_petition`
  - `extension_jurisdictional_statement`
  - `extension_merits_reply`
  - `extension_rehearing`
- **Unclassified: left out, and listed for review.**
  - an application type the reader couldn't recognise;
  - `bail`;
  - `vacate` of anything else.

The rule only reads the type the reader assigned. The type comes from the
Court's own filing entry, e.g. "Application (26A476) **for a stay**,
submitted to The Chief Justice.", through fixed patterns in
`scripts/lib/applications/parse.ts`. No LLM is involved, and wording no
pattern matches gets no type, never a guess.

To change the rule: edit `membership.ts`, bump `RULE_VERSION`, update this
page, then rebuild. Every row records the rule version that built it.

## Rebuilding and the review list

- `npx tsx scripts/rebuild-emergency-shadow-docket.ts` rebuilds the table
  from `application_details`. It makes no requests to the Court. The reader
  also does this at the end of every run.
- `npx tsx scripts/read-applications.ts --reclassify` re-applies the
  reader's type and outcome patterns to the stored records, then rebuilds.
  It also makes no requests. Use it after changing `parse.ts`.
- Each rebuild logs a row in `ingest_runs` with `stats.job =
  'emergency_shadow_docket'`, including the unclassified list:

  ```sql
  select started_at, stats->>'rule_version' rule, stats->>'members' members,
         stats->>'excluded' excluded, jsonb_pretty(stats->'unclassified') unclassified
  from ingest_runs where stats->>'job' = 'emergency_shadow_docket'
  order by started_at desc limit 1;
  ```
