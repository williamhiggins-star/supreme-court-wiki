"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomTabBar } from "@/components/BottomTabBar";
import { DashboardTitleBar } from "@/components/DashboardTitleBar";
import { LandingCarousel } from "@/components/LandingCarousel";
import { ScotusDashboard2Client } from "@/components/ScotusDashboard2Client";
import { DEFAULT_SECTION, type SectionKey } from "@/lib/dashboard2-sections";
import type { ScotusDashboard2Data } from "@/lib/scotusdashboard2-data";

// How long the slide-up takes before actually navigating -- the CSS
// transition below uses the same constant so the two can't drift apart.
const EXIT_TRANSITION_MS = 2200;

// True reveal, not a sequenced slide-then-load: the real dashboard is
// rendered right here, underneath this page's own overlay, using the
// exact same data /dashboard itself fetches (getScotusDashboard2Data,
// shared so the two routes can't drift on what the dashboard needs). The
// overlay (mobile top bar, carousel, footer) sits on top with its own
// opaque background; sliding it up on "Enter" reveals the dashboard
// that's been sitting there, already rendered, the whole time -- no
// loading gap after the slide, unlike navigating to a cold route.
export function ScotusDashboard2LandingClient({ data }: { data: ScotusDashboard2Data }) {
  const [active, setActive] = useState<SectionKey>(DEFAULT_SECTION);
  const [isExiting, setIsExiting] = useState(false);
  const router = useRouter();

  // Still worth prefetching -- once the URL actually swaps to
  // /dashboard, this makes that swap (which by then is invisible
  // either way, since identical content is already on screen) resolve
  // from cache rather than triggering its own fresh fetch.
  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  function handleEnter() {
    setIsExiting(true);
    setTimeout(() => router.push("/dashboard"), EXIT_TRANSITION_MS);
  }

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div className="absolute inset-0">
        <ScotusDashboard2Client {...data} initialCaseSlug={null} />
      </div>
      <div
        className="absolute inset-0 flex flex-col overflow-hidden bg-white ease-in-out"
        style={{
          transitionProperty: "transform",
          transitionDuration: `${EXIT_TRANSITION_MS}ms`,
          transform: isExiting ? "translateY(-100%)" : "translateY(0)",
        }}
      >
        <div className="flex shrink-0 items-center justify-center py-3 md:hidden">
          <span className="font-serif text-[20px] font-normal italic text-[#1A1A1A]">SCOTUS Dashboard</span>
        </div>
        <div className="mx-auto grid w-full min-h-0 max-w-[1600px] flex-1 grid-cols-1 auto-rows-[minmax(65vh,auto)] gap-y-8 overflow-y-auto px-6 pb-6 pt-8 md:grid-cols-3 md:auto-rows-auto md:gap-x-12 md:gap-y-0 md:overflow-hidden md:px-[100px] md:pb-[57px] md:pt-6">
          {/* No dashed placeholder border here -- matches every other panel
              in this app once it's showing real content instead of a
              scaffold (see e.g. commit 7fd1f31). */}
          <div className="h-full min-w-0 md:col-start-2">
            <LandingCarousel
              justices={data.justices}
              opinionLengthStats={data.opinionLengthStats}
              justiceAgreementGrid={data.justiceAgreementGrid}
              totalWordsByJustice={data.totalWordsByJustice}
            />
          </div>
        </div>
        <div className="mb-5 flex flex-col items-center gap-[35px]">
          <DashboardTitleBar active={active} onSelect={handleEnter} label="Enter" />
          {/* Mobile: no space-holder dropdown here (DashboardTitleBar's
              Enter button is desktop-only) -- a real, tappable Enter
              button instead, same footprint as the select it replaces. */}
          <button
            type="button"
            onClick={handleEnter}
            className="px-2 py-1 font-serif text-[15px] uppercase tracking-[0.04em] text-[#1A1A1A] md:hidden"
          >
            Enter
          </button>
          <BottomTabBar active={active} onSelect={setActive} sections={[]} hideMobileSelect />
        </div>
      </div>
    </div>
  );
}
