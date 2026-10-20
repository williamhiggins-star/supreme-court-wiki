"use client";

// Phone layout (below the md breakpoint). Desktop never renders this --
// ScotusDashboard2Client shows it with `md:hidden` and wraps the desktop
// layout in `hidden md:flex`, so the desktop markup is untouched.
//
// One normal scrolling page instead of three stacked panels: a Menu button
// and the site title at the top, then the section's filter buttons, then
// the results underneath. Every section change, case open and Back scrolls
// to the top. Large decorative panel images are left out on phones; justice
// portraits and Spotify links stay.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { SECTIONS, type SectionKey } from "@/lib/dashboard2-sections";
import type { CaseSummary, Article } from "@/types";
import type { DecidedItem } from "@/lib/docket";
import type { CalendarEvent } from "@/lib/calendar";
import type { CircuitSplit } from "@/lib/circuit-splits";
import type { ShadowDocketRow } from "@/lib/db/shadow-docket";
import type { OpinionTermStats } from "@/lib/scotusdashboard2-data";
import { CourtCalendar } from "@/components/CourtCalendar";
import { CaseDetailPanels } from "@/components/CaseDetailPanels";
import {
  ALL_JUSTICES,
  PERSON_SLUG_BY_JUSTICE_KEY,
  OPINIONS_MENU,
  CaseTitleLink,
  formatDate,
  JusticePortraitGroup,
  filterAllCasesItems,
  OpinionsEmptyState,
  OpinionExtremeOverviewPanel,
  OpinionExtremeByJusticePanel,
  VolumeByJusticePanel,
  VolumeHighlightsPanel,
  JusticeAgreementPanel,
  ConcurrenceJoinPanel,
  JusticeTotalWordsPanel,
  MajorityMinorityBarChart,
  ArticleListPanel,
  AboutMiddlePanel,
  AboutLeftPanel,
  ShadowDocketIntroPanel,
  ShadowDocketTablePanel,
} from "@/components/SectionPanels";

const LORA = { fontFamily: "'Lora', Georgia, serif" };

// Same stacked-panel container the old mobile layout used, minus its own
// inner scrolling (the page itself scrolls now). Used for the sections that
// keep their existing content as-is: Court Calendar, Shadow Docket, Third
// Party Analysis, About, and the case page.
const STACKED_PANELS = "grid grid-cols-1 auto-rows-[minmax(65vh,auto)] gap-y-8 px-6 pb-6 pt-4";

// Case page: the same panels, each only as tall as its content, so short
// panels don't leave large empty gaps.
const CASE_PANELS = "grid grid-cols-1 gap-y-8 px-6 pb-6 pt-2";

type Justice = (typeof ALL_JUSTICES)[number];

export type MobileAllCasesFilters = {
  majorityAuthor: string | null;
  setMajorityAuthor: (key: string | null) => void;
  majorityJustices: string[];
  setMajorityJustices: (keys: string[]) => void;
  concurringJustices: string[];
  setConcurringJustices: (keys: string[]) => void;
  concurringJoinedBy: Record<string, string[]>;
  setConcurringJoinedByForJustice: (justiceKey: string, joiners: string[]) => void;
  dissentingJustices: string[];
  setDissentingJustices: (keys: string[]) => void;
  dissentingJoinedBy: Record<string, string[]>;
  setDissentingJoinedByForJustice: (justiceKey: string, joiners: string[]) => void;
  issue: string | null;
  setIssue: (slug: string | null) => void;
  term: string | null;
  setTerm: (value: string | null) => void;
};

export function MobileDashboard({
  active,
  onSelectSection,
  activeCase,
  onSelectCase,
  onBack,
  upcomingCases,
  arguedCases,
  decidedItems,
  allCasesItems,
  issueCategories,
  termOptions,
  opinionStatsByTerm,
  selectedOpinionsTerm,
  onSelectOpinionsTerm,
  calendarEvents,
  scotusblogArticles,
  otherArticles,
  circuitSplitsBySlug,
  articlesByCaseSlug,
  shadowDocketRows,
  today,
  tomorrow,
  filters,
}: {
  active: SectionKey;
  onSelectSection: (key: SectionKey) => void;
  activeCase: CaseSummary | null;
  onSelectCase: (slug: string) => void;
  onBack: () => void;
  upcomingCases: CaseSummary[];
  arguedCases: CaseSummary[];
  decidedItems: DecidedItem[];
  allCasesItems: DecidedItem[];
  issueCategories: { slug: string; label: string }[];
  termOptions: { value: string; label: string }[];
  opinionStatsByTerm: Record<string, OpinionTermStats>;
  selectedOpinionsTerm: string;
  onSelectOpinionsTerm: (value: string | null) => void;
  calendarEvents: CalendarEvent[];
  scotusblogArticles: Article[];
  otherArticles: Article[];
  circuitSplitsBySlug: Record<string, CircuitSplit>;
  articlesByCaseSlug: Record<string, Article[]>;
  shadowDocketRows: ShadowDocketRow[];
  today: string;
  tomorrow: string;
  filters: MobileAllCasesFilters;
}) {
  // Kept here (not inside each section) so they survive opening a case and
  // coming back.
  const [docketTab, setDocketTab] = useState<DocketTab>("upcoming");
  const [opinionsItem, setOpinionsItem] = useState<string>("Longest");

  // Every page opens at the top: on first load, on a section change, on
  // opening a case and on Back. "instant" overrides the site-wide
  // `scroll-behavior: smooth` so it doesn't visibly scroll up.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [active, activeCase?.slug]);

  return (
    <div className="min-h-screen bg-white md:hidden">
      <MobileHeader active={active} onSelectSection={onSelectSection} />
      {activeCase ? (
        <>
          <div className="px-6 pt-2">
            <button
              type="button"
              onClick={onBack}
              className="py-1 font-serif text-[14px] uppercase tracking-[0.04em] text-[#1A1A1A] transition-colors hover:text-[#C43030]"
            >
              ← Back
            </button>
          </div>
          <div className={CASE_PANELS}>
            <CaseDetailPanels
              key={activeCase.slug}
              caseData={activeCase}
              circuitSplitsBySlug={circuitSplitsBySlug}
              articlesByCaseSlug={articlesByCaseSlug}
            />
          </div>
        </>
      ) : active === "docket" ? (
        <DocketSection
          tab={docketTab}
          onTab={setDocketTab}
          upcomingCases={upcomingCases}
          arguedCases={arguedCases}
          decidedItems={decidedItems}
          today={today}
          tomorrow={tomorrow}
          onSelectCase={onSelectCase}
        />
      ) : active === "all-cases" ? (
        <AllCasesSection
          items={allCasesItems}
          issueCategories={issueCategories}
          termOptions={termOptions}
          today={today}
          filters={filters}
          onSelectCase={onSelectCase}
        />
      ) : active === "opinions" ? (
        <OpinionsSection
          item={opinionsItem}
          onItem={setOpinionsItem}
          termOptions={termOptions}
          term={selectedOpinionsTerm}
          onTerm={onSelectOpinionsTerm}
          stats={opinionStatsByTerm[selectedOpinionsTerm]}
          onSelectCase={onSelectCase}
        />
      ) : active === "court-calendar" ? (
        <div className="px-6 pb-6 pt-4">
          <CourtCalendar events={calendarEvents} today={today} />
        </div>
      ) : active === "shadow-docket" ? (
        <div className={STACKED_PANELS}>
          <ShadowDocketIntroPanel />
          <ShadowDocketTablePanel rows={shadowDocketRows} />
        </div>
      ) : active === "analysis" ? (
        // The large "Third Party Sources" image is left out on phones.
        <div className={STACKED_PANELS}>
          <ArticleListPanel title="Legal Journalism" articles={scotusblogArticles} onNavigateSection={onSelectSection} />
          <ArticleListPanel title="General Journalism" articles={otherArticles} onNavigateSection={onSelectSection} />
        </div>
      ) : active === "about" ? (
        // The large About image is left out on phones.
        <div className={STACKED_PANELS}>
          <AboutMiddlePanel />
          <AboutLeftPanel />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- header

function MobileHeader({ active, onSelectSection }: { active: SectionKey; onSelectSection: (key: SectionKey) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-6 pt-3">
      {/* The title is centred on the full width; the menu button sits on
          top of the row's left edge so it never pushes the title off-centre. */}
      <div className="relative flex min-h-[36px] items-center justify-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Menu"
          className={`absolute left-0 top-1/2 flex h-[36px] w-[36px] -translate-y-1/2 items-center justify-center rounded-full border text-[#1A1A1A] transition-colors hover:text-[#C43030] ${
            open ? "border-[#1A1A1A] bg-[#F2EDE3]" : "border-[#C4A882] bg-[#FAFAF7]"
          }`}
        >
          <GavelIcon />
        </button>
        <span className="font-serif text-[20px] font-normal italic text-[#1A1A1A]">SCOTUS Dashboard</span>
      </div>
      {open && (
        <nav className="mt-2 border border-[#C4A882] bg-[#FAFAF7] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {SECTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelectSection(key);
              }}
              className={`block w-full border-b border-[#C4A882]/40 px-3 py-[10px] text-left font-serif text-[14px] uppercase tracking-[0.04em] text-[#1A1A1A] last:border-b-0 ${
                active === key ? "font-bold" : "font-normal"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// Gavel head tilted up-left, handle down-right, sound block underneath.
function GavelIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <g transform="translate(2 0.5)">
        <g transform="rotate(-45 12 11)">
          <rect x="6" y="3" width="12" height="6" rx="1.5" />
          <rect x="11" y="8.5" width="2" height="10.5" rx="1" />
        </g>
        <rect x="3" y="19" width="10" height="2.5" rx="1" />
      </g>
    </svg>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="px-6 pt-5 font-serif text-[22px] font-normal leading-tight text-[#1A1A1A]">{children}</p>;
}

// ---------------------------------------------------------------- filter buttons

type FilterDef = {
  key: string;
  label: string;
  // Short text for what's currently chosen, shown on the button itself.
  value?: string | null;
  content: (close: () => void) => ReactNode;
};

// A row of buttons; tapping one opens its dropdown directly underneath the
// row (in the page flow, so it never gets clipped). One open at a time;
// tapping elsewhere on the page closes it.
function FilterBar({ filters }: { filters: FilterDef[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const open = filters.find((f) => f.key === openKey);

  useEffect(() => {
    if (!openKey) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openKey]);

  return (
    <div ref={ref} className="px-6 pt-3">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const isOpen = f.key === openKey;
          const isSet = Boolean(f.value);
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setOpenKey(isOpen ? null : f.key)}
              aria-expanded={isOpen}
              className={`inline-flex max-w-full items-center gap-[6px] border px-3 py-[6px] text-left text-[13px] text-[#1A1A1A] ${
                isSet || isOpen ? "border-[#1A1A1A] bg-[#F2EDE3]" : "border-[#C4A882] bg-[#FAFAF7]"
              }`}
              style={LORA}
            >
              <span className="truncate">
                <span className={isSet ? "font-bold" : ""}>{f.label}</span>
                {f.value ? `: ${f.value}` : ""}
              </span>
              <span className="text-[9px] text-[#6B6560]">{isOpen ? "▲" : "▼"}</span>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="mt-2 border border-[#C4A882] bg-[#FAFAF7] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {open.content(() => setOpenKey(null))}
        </div>
      )}
    </div>
  );
}

function OptionButton({
  label,
  selected,
  onClick,
  justice,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  justice?: Justice;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex w-full min-w-0 items-center gap-[8px] px-3 py-[9px] text-left text-[14px] text-[#1A1A1A]"
      style={{ ...LORA, fontWeight: selected ? 700 : 400 }}
    >
      {justice && (
        <Image
          src={justice.photo}
          alt=""
          width={18}
          height={18}
          className="shrink-0 rounded-full object-cover object-top"
          style={{ width: 18, height: 18 }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <span className="text-[12px] text-[#C43030]">✓</span>}
    </button>
  );
}

// "Chief Justice Roberts" -> "Roberts (Chief)", "Justice Kagan" -> "Kagan":
// full names don't fit two columns at phone width.
function shortJusticeName(displayName: string): string {
  return displayName.startsWith("Chief Justice ")
    ? `${displayName.replace("Chief Justice ", "")} (Chief)`
    : displayName.replace(/^Justice /, "");
}

function justiceNames(keys: string[]): string | null {
  if (keys.length === 0) return null;
  const j = ALL_JUSTICES.find((x) => x.key === keys[0]);
  const first = j ? shortJusticeName(j.displayName) : keys[0];
  return keys.length === 1 ? first : `${first} +${keys.length - 1}`;
}

// "Term 2025" -> "2025" (the button already says "Term").
function termValue(options: { value: string; label: string }[], value: string | null): string | null {
  const label = options.find((o) => o.value === value)?.label;
  return label ? label.replace(/^Term /, "") : null;
}

// Single choice from a list; picking one closes the dropdown.
function SingleSelectList({
  options,
  value,
  onChange,
  close,
  allLabel,
}: {
  options: { value: string; label: string; justice?: Justice }[];
  value: string | null;
  onChange: (value: string | null) => void;
  close: () => void;
  allLabel?: string;
}) {
  return (
    <div>
      {allLabel && (
        <OptionButton
          label={allLabel}
          selected={value === null}
          onClick={() => {
            onChange(null);
            close();
          }}
        />
      )}
      {options.map((o) => (
        <OptionButton
          key={o.value}
          label={o.label}
          justice={o.justice}
          selected={value === o.value}
          onClick={() => {
            onChange(o.value);
            close();
          }}
        />
      ))}
    </div>
  );
}

// Several justices can be picked; the dropdown stays open until "Done".
function MultiJusticeList({
  options = ALL_JUSTICES,
  value,
  onChange,
  clearLabel,
}: {
  options?: readonly Justice[];
  value: string[];
  onChange: (keys: string[]) => void;
  clearLabel: string;
}) {
  return (
    <div>
      <OptionButton label={clearLabel} selected={value.length === 0} onClick={() => onChange([])} />
      <div className="grid grid-cols-2">
        {options.map((j) => (
          <OptionButton
            key={j.key}
            label={shortJusticeName(j.displayName)}
            justice={j}
            selected={value.includes(j.key)}
            onClick={() => onChange(value.includes(j.key) ? value.filter((k) => k !== j.key) : [...value, j.key])}
          />
        ))}
      </div>
    </div>
  );
}

function DoneButton({ close }: { close: () => void }) {
  return (
    <div className="border-t border-[#C4A882]/40 px-3 py-2 text-right">
      <button
        type="button"
        onClick={close}
        className="font-serif text-[13px] uppercase tracking-[0.04em] text-[#1A1A1A] transition-colors hover:text-[#C43030]"
      >
        Done
      </button>
    </div>
  );
}

// Concurring Opinion / Dissenting Opinion: pick the authoring justice(s),
// then optionally, for each one, who joined that justice's opinion -- the
// same "Joined By" filter the desktop panel has.
function OpinionSideList({
  justices,
  onJustices,
  joinedBy,
  onJoinedBy,
  close,
}: {
  justices: string[];
  onJustices: (keys: string[]) => void;
  joinedBy: Record<string, string[]>;
  onJoinedBy: (justiceKey: string, joiners: string[]) => void;
  close: () => void;
}) {
  const selected = ALL_JUSTICES.filter((j) => justices.includes(j.key));
  return (
    <div>
      <p className="px-3 pt-2 text-[12px] italic text-[#6B6560]" style={LORA}>
        Written by
      </p>
      <MultiJusticeList value={justices} onChange={onJustices} clearLabel="All Justices" />
      {selected.map((j) => (
        <div key={j.key} className="border-t border-[#C4A882]/40">
          <p className="px-3 pt-2 text-[12px] italic text-[#6B6560]" style={LORA}>
            Joined by — {j.displayName}
          </p>
          <MultiJusticeList
            options={ALL_JUSTICES.filter((o) => o.key !== j.key)}
            value={joinedBy[j.key] ?? []}
            onChange={(keys) => onJoinedBy(j.key, keys)}
            clearLabel="Any Justice"
          />
        </div>
      ))}
      <DoneButton close={close} />
    </div>
  );
}

// ---------------------------------------------------------------- case rows

const META = "text-[12px] font-normal not-italic text-[#6B6560]";
const TITLE_CLASS = "text-[15px] font-normal not-italic text-[#1A1A1A]";

function SpotifyLink({ href }: { href?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
      style={{ ...LORA, lineHeight: 1.6 }}
    >
      Listen on Spotify ↗
    </a>
  );
}

function EmptyList({ children }: { children: ReactNode }) {
  return (
    <p className="px-6 pt-6 text-center text-[13px] font-normal italic text-[#6B6560]" style={{ ...LORA, lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

// One case in a list: title, status line, docket number, Spotify link, and
// (for decided cases) the author/dissent portraits on the right.
function CaseRow({
  slug,
  title,
  statusLine,
  caseNumber,
  podcastEpisodeUrl,
  portraits,
  onSelectCase,
}: {
  slug: string;
  title: string;
  statusLine: string;
  caseNumber: string;
  podcastEpisodeUrl?: string;
  portraits?: ReactNode;
  onSelectCase: (slug: string) => void;
}) {
  return (
    <li className="flex gap-3 border-b border-[#C4A882]/50 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <CaseTitleLink slug={slug} title={title} onSelectCase={onSelectCase} className={TITLE_CLASS} />
        <p className={META} style={{ ...LORA, lineHeight: 1.6 }}>
          {statusLine}
        </p>
        <p className={META} style={{ ...LORA, lineHeight: 1.6 }}>
          {caseNumber}
        </p>
        <SpotifyLink href={podcastEpisodeUrl} />
      </div>
      {portraits && <div className="w-[96px] shrink-0 pt-[3px]">{portraits}</div>}
    </li>
  );
}

function itemStatusLine(item: DecidedItem, today: string): string {
  // Same wording as the desktop All Cases list.
  const isToday = item.docketStatus === "decided" ? item.decisionDate === today : item.argumentDate === today;
  return item.docketStatus === "decided"
    ? `${item.decisionDate ? `Decided ${formatDate(item.decisionDate)}` : "Decided"}${isToday ? " · Decided Today" : ""}`
    : item.docketStatus === "argued"
      ? `Argued ${formatDate(item.argumentDate)}${isToday ? " · Argued Today" : ""}`
      : `Argument ${formatDate(item.argumentDate)}${isToday ? " · Today" : ""}`;
}

function ItemRows({ items, today, onSelectCase }: { items: DecidedItem[]; today: string; onSelectCase: (slug: string) => void }) {
  return (
    <ul className="list-none px-6 pt-2">
      {items.map((item) => (
        <CaseRow
          key={item.slug}
          slug={item.slug}
          title={item.title}
          statusLine={itemStatusLine(item, today)}
          caseNumber={item.sub.split(" · ")[1] ?? item.sub}
          podcastEpisodeUrl={item.podcastEpisodeUrl}
          portraits={
            item.majorityAuthor ? (
              <JusticePortraitGroup majorityAuthor={item.majorityAuthor} dissentSideJustices={item.dissentSideJustices} />
            ) : undefined
          }
          onSelectCase={onSelectCase}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- The Docket

type DocketTab = "upcoming" | "argued" | "decided";

function DocketSection({
  tab,
  onTab,
  upcomingCases,
  arguedCases,
  decidedItems,
  today,
  tomorrow,
  onSelectCase,
}: {
  tab: DocketTab;
  onTab: (tab: DocketTab) => void;
  upcomingCases: CaseSummary[];
  arguedCases: CaseSummary[];
  decidedItems: DecidedItem[];
  today: string;
  tomorrow: string;
  onSelectCase: (slug: string) => void;
}) {
  const tabs: { key: DocketTab; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: upcomingCases.length },
    { key: "argued", label: "Argued", count: arguedCases.length },
    { key: "decided", label: "Decided", count: decidedItems.length },
  ];
  return (
    <div className="pb-8">
      <SectionTitle>The Docket</SectionTitle>
      <div className="flex gap-2 px-6 pt-3" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => onTab(t.key)}
            className={`flex-1 border px-2 py-[7px] text-center text-[13px] text-[#1A1A1A] ${
              tab === t.key ? "border-[#1A1A1A] bg-[#F2EDE3] font-bold" : "border-[#C4A882] bg-[#FAFAF7]"
            }`}
            style={LORA}
          >
            {t.label} <span className="font-normal text-[#6B6560]">({t.count})</span>
          </button>
        ))}
      </div>
      {tab === "upcoming" ? (
        upcomingCases.length === 0 ? (
          <EmptyList>Case and oral argument information for the next term will be added in the coming weeks. Thank you.</EmptyList>
        ) : (
          <ul className="list-none px-6 pt-2">
            {upcomingCases.map((c) => (
              <CaseRow
                key={c.slug}
                slug={c.slug}
                title={c.title}
                statusLine={`${formatDate(c.argumentDate)}${c.argumentDate === today ? " · Today" : c.argumentDate === tomorrow ? " · Tomorrow" : ""}`}
                caseNumber={c.caseNumber}
                onSelectCase={onSelectCase}
              />
            ))}
          </ul>
        )
      ) : tab === "argued" ? (
        arguedCases.length === 0 ? (
          <EmptyList>No cases.</EmptyList>
        ) : (
          <ul className="list-none px-6 pt-2">
            {arguedCases.map((c) => (
              <CaseRow
                key={c.slug}
                slug={c.slug}
                title={c.title}
                statusLine={`Argued ${formatDate(c.argumentDate)}`}
                caseNumber={c.caseNumber}
                podcastEpisodeUrl={c.podcastEpisodeUrl}
                onSelectCase={onSelectCase}
              />
            ))}
          </ul>
        )
      ) : decidedItems.length === 0 ? (
        <EmptyList>No cases.</EmptyList>
      ) : (
        <ItemRows items={decidedItems} today={today} onSelectCase={onSelectCase} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- All Cases

function AllCasesSection({
  items,
  issueCategories,
  termOptions,
  today,
  filters: f,
  onSelectCase,
}: {
  items: DecidedItem[];
  issueCategories: { slug: string; label: string }[];
  termOptions: { value: string; label: string }[];
  today: string;
  filters: MobileAllCasesFilters;
  onSelectCase: (slug: string) => void;
}) {
  // Same filtering function the desktop list uses, so both always agree.
  const filtered = filterAllCasesItems(
    items,
    f.majorityAuthor,
    f.majorityJustices,
    f.concurringJustices,
    f.concurringJoinedBy,
    f.dissentingJustices,
    f.dissentingJoinedBy,
    f.issue,
    f.term,
  );
  const justiceOptions = ALL_JUSTICES.map((j) => ({ value: j.key, label: shortJusticeName(j.displayName), justice: j }));

  const defs: FilterDef[] = [
    {
      key: "term",
      label: "Term",
      value: termValue(termOptions, f.term),
      content: (close) => <SingleSelectList options={termOptions} value={f.term} onChange={f.setTerm} close={close} allLabel="All Terms" />,
    },
    {
      key: "issue",
      label: "Issue",
      value: issueCategories.find((o) => o.slug === f.issue)?.label ?? null,
      content: (close) => (
        <div className="max-h-[55vh] overflow-y-auto">
          <SingleSelectList
            options={issueCategories.map((o) => ({ value: o.slug, label: o.label }))}
            value={f.issue}
            onChange={f.setIssue}
            close={close}
            allLabel="All Issues"
          />
        </div>
      ),
    },
    {
      key: "author",
      label: "Majority Author",
      value: justiceNames(f.majorityAuthor ? [f.majorityAuthor] : []),
      content: (close) => (
        <SingleSelectList options={justiceOptions} value={f.majorityAuthor} onChange={f.setMajorityAuthor} close={close} allLabel="All Justices" />
      ),
    },
    {
      key: "majority",
      label: "Majority Justices",
      value: justiceNames(f.majorityJustices),
      content: (close) => (
        <>
          <MultiJusticeList value={f.majorityJustices} onChange={f.setMajorityJustices} clearLabel="All Justices" />
          <DoneButton close={close} />
        </>
      ),
    },
    {
      key: "concurring",
      label: "Concurring Opinion",
      value: justiceNames(f.concurringJustices),
      content: (close) => (
        <OpinionSideList
          justices={f.concurringJustices}
          onJustices={f.setConcurringJustices}
          joinedBy={f.concurringJoinedBy}
          onJoinedBy={f.setConcurringJoinedByForJustice}
          close={close}
        />
      ),
    },
    {
      key: "dissenting",
      label: "Dissenting Opinion",
      value: justiceNames(f.dissentingJustices),
      content: (close) => (
        <OpinionSideList
          justices={f.dissentingJustices}
          onJustices={f.setDissentingJustices}
          joinedBy={f.dissentingJoinedBy}
          onJoinedBy={f.setDissentingJoinedByForJustice}
          close={close}
        />
      ),
    },
  ];

  return (
    <div className="pb-8">
      <SectionTitle>All Cases</SectionTitle>
      <FilterBar filters={defs} />
      <p className="px-6 pt-4 text-[13px] italic text-[#1A1A1A]" style={LORA}>
        Cases: {filtered.length}
      </p>
      {filtered.length === 0 ? <EmptyList>No cases.</EmptyList> : <ItemRows items={filtered} today={today} onSelectCase={onSelectCase} />}
    </div>
  );
}

// ---------------------------------------------------------------- Opinions Data

// Wide grids (nine justices across) scroll sideways on their own rather
// than shrinking the portraits; the rest of the page doesn't move.
function SideScroll({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">{children}</div>
    </div>
  );
}

function OpinionsSection({
  item,
  onItem,
  termOptions,
  term,
  onTerm,
  stats,
  onSelectCase,
}: {
  item: string;
  onItem: (item: string) => void;
  termOptions: { value: string; label: string }[];
  term: string;
  onTerm: (value: string | null) => void;
  stats: OpinionTermStats | undefined;
  onSelectCase: (slug: string) => void;
}) {
  const groups = Object.fromEntries(OPINIONS_MENU.map((m) => [m.label, m.children ?? []]));
  const groupDef = (label: string): FilterDef => {
    const children = groups[label] ?? [];
    const isJustices = label === "Justices";
    return {
      key: label,
      label,
      value: children.includes(item) ? (isJustices ? justiceNames([ALL_JUSTICES.find((j) => j.displayName === item)!.key]) : item) : null,
      content: (close) => (
        <div className={isJustices ? "grid grid-cols-2" : ""}>
          {children.map((child) => (
            <OptionButton
              key={child}
              label={isJustices ? shortJusticeName(child) : child}
              justice={isJustices ? ALL_JUSTICES.find((j) => j.displayName === child) : undefined}
              selected={item === child}
              onClick={() => {
                onItem(child);
                close();
              }}
            />
          ))}
        </div>
      ),
    };
  };
  const defs: FilterDef[] = [
    {
      key: "term",
      label: "Term",
      value: termValue(termOptions, term),
      content: (close) => <SingleSelectList options={termOptions} value={term} onChange={onTerm} close={close} />,
    },
    groupDef("Length"),
    groupDef("Alignment"),
    groupDef("Volume"),
    groupDef("Justices"),
  ];

  return (
    <div className="pb-8">
      <SectionTitle>Opinions Data</SectionTitle>
      <FilterBar filters={defs} />
      <div className="flex flex-col gap-y-8 pt-4">
        <OpinionsContent item={item} term={term} stats={stats} onSelectCase={onSelectCase} />
      </div>
    </div>
  );
}

// The same views the desktop panel shows for each menu choice, minus the
// decorative images desktop puts in its third column.
function OpinionsContent({
  item,
  term,
  stats,
  onSelectCase,
}: {
  item: string;
  term: string;
  stats: OpinionTermStats | undefined;
  onSelectCase: (slug: string) => void;
}) {
  if (!stats || !stats.hasOpinions) return <OpinionsEmptyState term={term} />;

  const justices = stats.justiceStats;
  const length = stats.opinionLength;
  switch (item) {
    case "Longest":
    case "Shortest": {
      const longest = item === "Longest";
      return (
        <>
          <OpinionExtremeOverviewPanel
            title={item}
            averageWordCount={length.averageWordCount}
            overall={longest ? length.longestOverall : length.shortestOverall}
            majority={longest ? length.longestMajority : length.shortestMajority}
            concurrence={longest ? length.longestConcurrence : length.shortestConcurrence}
            onSelectCase={onSelectCase}
          />
          <OpinionExtremeByJusticePanel
            title={item}
            data={longest ? length.longestByJustice : length.shortestByJustice}
            onSelectCase={onSelectCase}
          />
        </>
      );
    }
    case "All":
      return <VolumeByJusticePanel justices={justices} highlights={stats.joinerHighlights} onSelectCase={onSelectCase} />;
    case "Concurrences and Dissents":
      return <VolumeHighlightsPanel justices={justices} highlights={stats.joinerHighlights} />;
    case "All Votes":
      return (
        <SideScroll>
          <JusticeAgreementPanel pairs={stats.agreementGrid} />
        </SideScroll>
      );
    case "Joiners":
      return (
        <SideScroll>
          <ConcurrenceJoinPanel concurrenceData={stats.concurrenceJoinMatrix} dissentData={stats.dissentJoinMatrix} />
        </SideScroll>
      );
  }

  const justice = ALL_JUSTICES.find((j) => j.displayName === item);
  const slug = justice ? PERSON_SLUG_BY_JUSTICE_KEY[justice.key] : null;
  if (!justice || !slug) return null;
  const maxTotal = Math.max(1, ...justices.map((j) => j.majorityOpinions + j.concurrences + j.dissents));
  return (
    <>
      <JusticeTotalWordsPanel
        totalWords={stats.totalWordsByJustice[slug] ?? 0}
        longest={length.longestByJustice.find((r) => r.justiceSlug === slug) ?? null}
        shortest={length.shortestByJustice.find((r) => r.justiceSlug === slug) ?? null}
        justiceSlug={slug}
        justice={justices.find((j) => j.key === justice.key) ?? null}
        maxTotal={maxTotal}
        onSelectCase={onSelectCase}
      />
      <MajorityMinorityBarChart
        rate={stats.majorityMinorityRateByJustice[slug] ?? null}
        agreementPairs={stats.agreementGrid}
        justiceSlug={slug}
      />
    </>
  );
}
