# Fix log

Plain-English notes on display bugs we found and fixed on the live site.
Newest first.

## 2026-10-20: Docket and All Cases showed the wrong vote split

**What was wrong.** On The Docket and All Cases, each decided case shows a
small row of justice portraits split into "Majority" and "Dissent". For
Trump v. Slaughter it showed only Justice Sotomayor dissenting, so it read
as 8–1. The real vote was 6–3: Sotomayor wrote the dissent, and Justices
Kagan and Jackson joined it. The case's own page was already right.

**Why.** The portrait row only counted justices who *wrote* a dissent. A
justice who signed on to someone else's dissent, without writing their own,
was put in the Majority row by default. The database had the right
information all along. The list pages just weren't using all of it.

**The fix.** The portrait row now uses the same calculation the case page
uses (`computeDecisionSides()` in `src/lib/decisionSides.ts`). That counts
dissent authors *and* the justices who joined them. The vote count and the
portraits now come from the same list, so they can't disagree. This
corrected 25 decided OT2025 cases, not just Slaughter.

Files changed: `src/lib/docket.ts`, `src/components/SectionPanels.tsx`.

**Still not right (known, not caused by this fix).** Four cases still show
too few dissenters in the portrait row. Their vote count ("6–3" etc.) is
correct, because it comes from a hand-entered vote line. The four cases have
three different problems:

| Case | How decided | Shows | Should be | Problem |
|---|---|---|---|---|
| Klein v. Martin | Per curiam | 9–0 | 8–1 | Jackson dissented without a written opinion |
| McCarthy v. Hernandez | Per curiam | 9–0 | 6–3 | Sotomayor, Kagan and Jackson dissented without a written opinion |
| District of Columbia v. R.W. | Per curiam | 8–1 | 7–2 | Sotomayor has no vote recorded at all |
| West Virginia v. B.P.J. | Signed (Kavanaugh) | 9–0 | 6–3 | Sotomayor, Kagan and Jackson concurred in part and dissented in part |

1. **Dissent with no written opinion** (Klein, McCarthy). These are summary
   reversals: the Court decided without full briefing or argument. A justice
   can dissent with just a one-line note, and no opinion is written. The
   site only finds dissenters through written opinions and who joined them,
   so these dissenters are missed. The per-justice vote table (`decisions`)
   records them correctly.
2. **Part agree, part dissent** (B.P.J.). Sotomayor's opinion, joined by
   Kagan and Jackson, and Jackson's own opinion are recorded as "concurring
   in part and dissenting in part". The portrait row only has Majority and
   Dissent, so they land under Majority. The `decisions` table records all
   three as dissenting.
3. **Missing data** (R.W.). The `decisions` table has only 8 rows for this
   case: Jackson dissenting, seven in the majority, and nothing for
   Sotomayor. The only written dissent is Jackson's, with no one joining.
   If the 7–2 is right, Sotomayor was probably the second dissenter, but
   nothing in the database confirms it. It's also possible she didn't take
   part and the 7–2 is wrong. Someone needs to check the opinion itself.

**Possible fixes (not done yet).** Building the portrait row from the
`decisions` table instead of the opinions would fix Klein, McCarthy and
B.P.J. R.W. needs a data fix first: confirm what Sotomayor did, then add
her vote row (or correct the 7–2).
