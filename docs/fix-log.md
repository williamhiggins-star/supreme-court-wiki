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

**Still not right (known, not caused by this fix).** Four cases still draw
too few dissenters, because the dissent isn't recorded as an opinion we can
read from:

- Klein v. Martin (8–1), McCarthy v. Hernandez (6–3) and District of
  Columbia v. R.W. (7–2): unsigned (per curiam) decisions with dissents
  that don't appear in the opinion data (no written opinion recorded for
  them).
- West Virginia v. B.P.J. (6–3): Sotomayor and Jackson agreed in part and
  dissented in part. The two-row display has no place for that, so they
  appear under Majority.

The database's `decisions` table does have the correct side for every
justice in all four. Reading the portraits from there would fix them. Not
done yet.
