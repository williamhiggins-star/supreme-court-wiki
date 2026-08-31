"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AboutRightPanel,
  JusticeAgreementPanel,
  OpinionsAlignmentImagePanel,
  JusticeTotalWordsPanel,
} from "@/components/SectionPanels";
import type { JusticeStat } from "@/lib/justices";
import type { OpinionLengthStats, JusticeAgreementPair } from "@/lib/db/term-stats";

const SLIDE_MS = 3000;
const TRANSITION_MS = 700;
const REAL_COUNT = 4;
// The strip is REAL_COUNT panels plus one more: a duplicate of the first,
// appended at the end. Sliding onto that duplicate LOOKS identical to
// sliding onto the real first panel, so slide 4 -> 1 can be a normal
// right-to-left slide (not a backward flip through 3, 2, 1) -- once it
// settles, the index snaps invisibly back to the real first panel so the
// next tick can slide forward again, endlessly.
const STRIP_COUNT = REAL_COUNT + 1;

// The four already-built panels this rotates through, reused as-is (not
// reimplemented): About's image panel, Opinions Data > Alignment > All
// Votes' panels 2 and 3, and Opinions Data > Justices > Chief Justice
// Roberts' panel 2.
export function LandingCarousel({
  justices,
  opinionLengthStats,
  justiceAgreementGrid,
  totalWordsByJustice,
}: {
  justices: JusticeStat[];
  opinionLengthStats: OpinionLengthStats;
  justiceAgreementGrid: JusticeAgreementPair[];
  totalWordsByJustice: Record<string, number>;
}) {
  const [index, setIndex] = useState(0);
  const [transitionsEnabled, setTransitionsEnabled] = useState(true);
  const indexRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      const next = indexRef.current + 1;
      indexRef.current = next;
      setTransitionsEnabled(true);
      setIndex(next);
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, []);

  // Once the slide onto the duplicate (index REAL_COUNT) has visually
  // finished, snap back to the real first panel (index 0) -- same
  // content, so the snap is invisible, and it resets state so the next
  // tick advances 0 -> 1 again instead of sliding off the end of the strip.
  useEffect(() => {
    if (index !== REAL_COUNT) return;
    const timeout = setTimeout(() => {
      setTransitionsEnabled(false);
      indexRef.current = 0;
      setIndex(0);
    }, TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [index]);

  // Re-enable the transition on its own frame, separate from the commit
  // that did the instant snap -- re-enabling in the same commit as the
  // snap wouldn't animate anyway (no prior frame with the transition
  // already active to interpolate from).
  useEffect(() => {
    if (transitionsEnabled) return;
    const id = requestAnimationFrame(() => setTransitionsEnabled(true));
    return () => cancelAnimationFrame(id);
  }, [transitionsEnabled]);

  function handleSelectCase(slug: string) {
    router.push(`/dashboard?case=${slug}`);
  }

  // Same computation the real "Chief Justice Roberts" selection in
  // Opinions Data > Justices does (src/components/SectionPanels.tsx),
  // just hardcoded to Roberts instead of derived from a menu selection.
  const roberts = justices.find((j) => j.key === "roberts") ?? null;
  const maxTotalOpinions = Math.max(1, ...justices.map((j) => j.majorityOpinions + j.concurrences + j.dissents));
  const robertsLongest = opinionLengthStats.longestByJustice.find((r) => r.justiceSlug === "john-roberts") ?? null;
  const robertsShortest = opinionLengthStats.shortestByJustice.find((r) => r.justiceSlug === "john-roberts") ?? null;
  const robertsTotalWords = totalWordsByJustice["john-roberts"] ?? 0;

  return (
    <div className="h-full min-w-0 overflow-hidden">
      <div
        className="flex h-full ease-in-out"
        style={{
          width: `${STRIP_COUNT * 100}%`,
          transform: `translateX(-${index * (100 / STRIP_COUNT)}%)`,
          transitionProperty: transitionsEnabled ? "transform" : "none",
          transitionDuration: `${TRANSITION_MS}ms`,
        }}
      >
        <div className="h-full shrink-0" style={{ width: `${100 / STRIP_COUNT}%` }}>
          <AboutRightPanel />
        </div>
        <div className="h-full shrink-0" style={{ width: `${100 / STRIP_COUNT}%` }}>
          <JusticeAgreementPanel pairs={justiceAgreementGrid} />
        </div>
        <div className="h-full shrink-0" style={{ width: `${100 / STRIP_COUNT}%` }}>
          <OpinionsAlignmentImagePanel />
        </div>
        <div className="h-full shrink-0" style={{ width: `${100 / STRIP_COUNT}%` }}>
          <JusticeTotalWordsPanel
            totalWords={robertsTotalWords}
            longest={robertsLongest}
            shortest={robertsShortest}
            justiceSlug="john-roberts"
            justice={roberts}
            maxTotal={maxTotalOpinions}
            onSelectCase={handleSelectCase}
          />
        </div>
        {/* Duplicate of the first panel -- see STRIP_COUNT comment above. */}
        <div className="h-full shrink-0" style={{ width: `${100 / STRIP_COUNT}%` }}>
          <AboutRightPanel />
        </div>
      </div>
    </div>
  );
}
