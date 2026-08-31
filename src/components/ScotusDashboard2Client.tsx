"use client";

import { useState } from "react";
import { BottomTabBar } from "@/components/BottomTabBar";
import { DashboardTitleBar } from "@/components/DashboardTitleBar";
import { SectionPanels } from "@/components/SectionPanels";
import { CourtCalendar } from "@/components/CourtCalendar";
import { CaseDetailPanels } from "@/components/CaseDetailPanels";
import { CaseTitleBar } from "@/components/CaseTitleBar";
import { DEFAULT_SECTION, type SectionKey } from "@/lib/dashboard2-sections";
import type { CaseSummary, Article } from "@/types";
import type { DecidedItem } from "@/app/page";
import type { IssueCategoryRef } from "@/lib/db/cases";
import type { JusticeStat } from "@/lib/justices";
import type { CalendarEvent } from "@/lib/calendar";
import type { CircuitSplit } from "@/lib/circuit-splits";
import type {
  OpinionLengthStats,
  JusticeAgreementPair,
  OpinionJoinerHighlights,
  JusticeJoinData,
  JusticeMajorityMinorityRate,
} from "@/lib/db/term-stats";

export function ScotusDashboard2Client({
  cases,
  initialCaseSlug,
  upcomingCases,
  arguedCases,
  decidedItems,
  issueCategories,
  justices,
  opinionLengthStats,
  justiceAgreementGrid,
  opinionJoinerHighlights,
  concurrenceJoinMatrix,
  dissentJoinMatrix,
  totalWordsByJustice,
  majorityMinorityRateByJustice,
  calendarEvents,
  scotusblogArticles,
  otherArticles,
  circuitSplitsBySlug,
  articlesByCaseSlug,
  today,
  tomorrow,
}: {
  cases: CaseSummary[];
  initialCaseSlug: string | null;
  upcomingCases: CaseSummary[];
  arguedCases: CaseSummary[];
  decidedItems: DecidedItem[];
  issueCategories: IssueCategoryRef[];
  justices: JusticeStat[];
  opinionLengthStats: OpinionLengthStats;
  justiceAgreementGrid: JusticeAgreementPair[];
  opinionJoinerHighlights: OpinionJoinerHighlights;
  concurrenceJoinMatrix: JusticeJoinData;
  dissentJoinMatrix: JusticeJoinData;
  totalWordsByJustice: Record<string, number>;
  majorityMinorityRateByJustice: Record<string, JusticeMajorityMinorityRate>;
  calendarEvents: CalendarEvent[];
  scotusblogArticles: Article[];
  otherArticles: Article[];
  circuitSplitsBySlug: Record<string, CircuitSplit>;
  articlesByCaseSlug: Record<string, Article[]>;
  today: string;
  tomorrow: string;
}) {
  const [active, setActive] = useState<SectionKey>(DEFAULT_SECTION);
  const [activeCaseSlug, setActiveCaseSlug] = useState<string | null>(initialCaseSlug);
  // Lifted above SectionPanels (rather than local state there) because
  // SectionPanels unmounts whenever a case panel is open -- selecting a
  // case and hitting "back" would otherwise silently reset the filter.
  const [selectedMajorityAuthor, setSelectedMajorityAuthor] = useState<string | null>(null);
  const [selectedMajorityJustices, setSelectedMajorityJustices] = useState<string[]>([]);
  const [selectedConcurringJustices, setSelectedConcurringJustices] = useState<string[]>([]);
  const [selectedConcurringJoinedBy, setSelectedConcurringJoinedBy] = useState<Record<string, string[]>>({});
  const [selectedDissentingJustices, setSelectedDissentingJustices] = useState<string[]>([]);
  const [selectedDissentingJoinedBy, setSelectedDissentingJoinedBy] = useState<Record<string, string[]>>({});
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  function handleSelectConcurringJoinedBy(justiceKey: string, joiners: string[]) {
    setSelectedConcurringJoinedBy((prev) => ({ ...prev, [justiceKey]: joiners }));
  }

  function handleSelectDissentingJoinedBy(justiceKey: string, joiners: string[]) {
    setSelectedDissentingJoinedBy((prev) => ({ ...prev, [justiceKey]: joiners }));
  }

  function handleSelectSection(key: SectionKey) {
    setActiveCaseSlug(null);
    setActive(key);
  }

  const activeCase = activeCaseSlug ? cases.find((c) => c.slug === activeCaseSlug) ?? null : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Mobile-only, always visible regardless of section/case -- desktop
          gets the same text via DashboardTitleBar in the footer instead,
          unchanged. */}
      <div className="flex shrink-0 items-center justify-center border-b border-[var(--tan)] py-3 md:hidden">
        <span className="font-serif text-[20px] font-normal italic text-[#1A1A1A]">SCOTUS Dashboard</span>
      </div>
      {/* Mobile rows: minmax(65vh, auto), not a bare 65vh -- individual
          panels clip their own overflow (overflow-hidden, no scroll of
          their own on mobile), so a hard-capped row height was cutting
          off any panel whose content actually needs more than 65vh. The
          minimum still gives h-full inside each panel a real height to
          resolve against; the auto max lets a row grow past it instead
          of clipping. Desktop (md:auto-rows-auto) is unaffected either
          way -- it's a single row of 3 columns, not multiple rows. */}
      {activeCase ? (
        <div className="mx-auto grid w-full min-h-0 max-w-[1600px] flex-1 grid-cols-1 auto-rows-[minmax(65vh,auto)] gap-y-8 overflow-y-auto px-6 pb-6 pt-8 md:grid-cols-3 md:auto-rows-auto md:gap-x-12 md:gap-y-0 md:overflow-hidden md:px-[100px] md:pb-[57px] md:pt-6">
          <CaseDetailPanels
            key={activeCase.slug}
            caseData={activeCase}
            circuitSplitsBySlug={circuitSplitsBySlug}
            articlesByCaseSlug={articlesByCaseSlug}
          />
        </div>
      ) : active === "court-calendar" ? (
        <div className="mx-auto w-full min-h-0 max-w-[1600px] flex-1 overflow-y-auto px-6 pb-6 pt-8 md:px-[100px] md:pb-[57px] md:pt-6">
          <CourtCalendar events={calendarEvents} today={today} />
        </div>
      ) : (
        <div className="mx-auto grid w-full min-h-0 max-w-[1600px] flex-1 grid-cols-1 auto-rows-[minmax(65vh,auto)] gap-y-8 overflow-y-auto px-6 pb-6 pt-8 md:grid-cols-3 md:auto-rows-auto md:gap-x-12 md:gap-y-0 md:overflow-hidden md:px-[100px] md:pb-[57px] md:pt-6">
          <SectionPanels
            active={active}
            upcomingCases={upcomingCases}
            arguedCases={arguedCases}
            decidedItems={decidedItems}
            issueCategories={issueCategories}
            justices={justices}
            opinionLengthStats={opinionLengthStats}
            justiceAgreementGrid={justiceAgreementGrid}
            opinionJoinerHighlights={opinionJoinerHighlights}
            concurrenceJoinMatrix={concurrenceJoinMatrix}
            dissentJoinMatrix={dissentJoinMatrix}
            totalWordsByJustice={totalWordsByJustice}
            majorityMinorityRateByJustice={majorityMinorityRateByJustice}
            scotusblogArticles={scotusblogArticles}
            otherArticles={otherArticles}
            onSelectCase={setActiveCaseSlug}
            today={today}
            tomorrow={tomorrow}
            selectedMajorityAuthor={selectedMajorityAuthor}
            onSelectMajorityAuthor={setSelectedMajorityAuthor}
            selectedMajorityJustices={selectedMajorityJustices}
            onSelectMajorityJustices={setSelectedMajorityJustices}
            selectedConcurringJustices={selectedConcurringJustices}
            onSelectConcurringJustices={setSelectedConcurringJustices}
            selectedConcurringJoinedBy={selectedConcurringJoinedBy}
            onSelectConcurringJoinedByForJustice={handleSelectConcurringJoinedBy}
            selectedDissentingJustices={selectedDissentingJustices}
            onSelectDissentingJustices={setSelectedDissentingJustices}
            selectedDissentingJoinedBy={selectedDissentingJoinedBy}
            onSelectDissentingJoinedByForJustice={handleSelectDissentingJoinedBy}
            selectedIssue={selectedIssue}
            onSelectIssue={setSelectedIssue}
          />
        </div>
      )}
      <div className="mb-5 flex flex-col items-center gap-[35px]">
        {activeCase ? (
          <CaseTitleBar title={activeCase.title} onBack={() => setActiveCaseSlug(null)} />
        ) : (
          <DashboardTitleBar active={active} onSelect={handleSelectSection} />
        )}
        <BottomTabBar active={active} onSelect={handleSelectSection} />
      </div>
    </div>
  );
}
