"use client";

import {
  useState,
  useRef,
  useLayoutEffect,
  type RefObject,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import type { CaseSummary, PartyArgument, CitedPrecedent, Article } from "@/types";
import type { CircuitSplit } from "@/lib/circuit-splits";
import { computeDecisionSides, JUSTICE_ORDER } from "@/lib/decisionSides";

// The nine sitting justices — matches data/justices.json's key/photo pairing.
const CASE_PANEL_JUSTICES: Record<string, { displayName: string; photo: string }> = {
  roberts: { displayName: "Chief Justice Roberts", photo: "/images/justices/roberts.jpg" },
  thomas: { displayName: "Justice Thomas", photo: "/images/justices/thomas.jpg" },
  alito: { displayName: "Justice Alito", photo: "/images/justices/alito.jpg" },
  sotomayor: { displayName: "Justice Sotomayor", photo: "/images/justices/sotomayor.jpg" },
  kagan: { displayName: "Justice Kagan", photo: "/images/justices/kagan.jpg" },
  gorsuch: { displayName: "Justice Gorsuch", photo: "/images/justices/gorsuch.jpg" },
  kavanaugh: { displayName: "Justice Kavanaugh", photo: "/images/justices/kavanaugh.jpg" },
  barrett: { displayName: "Justice Barrett", photo: "/images/justices/barrett.jpg" },
  jackson: { displayName: "Justice Jackson", photo: "/images/justices/jackson.jpg" },
};

// The full slip opinion — majority, concurrences, and dissents together —
// is one combined PDF per case, so every author's "Full Text" button points
// at the same URL. Pulled from the "Opinion filed. See: <url>" pattern in
// `outcome`, which every currently-decided case has.
function extractOpinionPdfUrl(outcome: string | undefined): string | undefined {
  if (!outcome) return undefined;
  const match = outcome.match(/https?:\/\/\S+\.pdf/);
  return match?.[0];
}

// Duplicated from src/app/page.tsx (a server component that can't be
// imported into this client component — it pulls in fs-based data helpers).
function getCaseDocketStatus(c: CaseSummary): "upcoming" | "argued" | "decided" {
  if (c.docketStatus === "decided") return "decided";
  if (c.outcome) return "decided";
  if (!c.argumentDate) return "upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = c.argumentDate.split("-").map(Number);
  const argDate = new Date(y, m - 1, d);
  if (argDate > today) return "upcoming";
  return "argued";
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Same section list/order/conditions as src/app/cases/[slug]/page.tsx.
function getCaseMenuItems({
  caseData,
  hasCircuitSplit,
  hasArticles,
}: {
  caseData: CaseSummary;
  hasCircuitSplit: boolean;
  hasArticles: boolean;
}): string[] {
  const hasDecision = Boolean(caseData.majorityAuthor || caseData.majorityOpinionSummary);
  const hasPetitioner = caseData.parties.some((p) => p.role === "petitioner");
  const hasRespondent = caseData.parties.some((p) => p.role === "respondent");
  const hasPrecedents = caseData.citedPrecedents.length > 0;

  return [
    hasDecision && "Decisions & Opinions",
    "Background & Facts",
    "Why This Case Matters",
    hasCircuitSplit && "The Circuit Split",
    hasPetitioner && "Petitioner",
    hasRespondent && "Respondent",
    hasPrecedents && "Precedent Cases Cited",
    // "Legal Terminology" temporarily hidden from the menu — not removed, just not shown.
    hasArticles && "Third Party Analysis",
  ].filter((item): item is string => Boolean(item));
}

function CaseScaffoldPanel({ index, selectedItem }: { index: number; selectedItem: string | null }) {
  return (
    <div className="flex h-full min-w-0 items-center justify-center">
      <span className="font-mono text-xs uppercase tracking-wider text-[#6B6560]">
        case panel {index}
        {selectedItem ? ` — ${selectedItem}` : ""}
      </span>
    </div>
  );
}

// Custom scroll indicator — native scrollbars (even styled ones) stay
// hidden until hover/scroll on macOS when "overlay scrollbars" are on, and
// no CSS can override that OS-level behavior. This draws its own always-
// visible thumb instead, so scrollability is obvious without interaction.
// `outerClassName`/`outerStyle` participate in the parent flex/grid layout
// (same role the scrollable element used to play); `innerClassName` holds
// the actual overflow + padding that used to live on that single element.
function ScrollableRegion({
  outerClassName,
  outerStyle,
  innerClassName,
  innerStyle,
  children,
}: {
  outerClassName: string;
  outerStyle?: CSSProperties;
  innerClassName: string;
  innerStyle?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);

  function update() {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - clientHeight <= 1) {
      setThumb(null);
      return;
    }
    const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - thumbHeight;
    const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumb({ top: thumbTop, height: thumbHeight });
  }

  useLayoutEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    // The thumb sits 2–6px in from the edge (2px margin + 4px wide). Reserve
    // 9px of padding so text ends with a clear 3px gap before the thumb,
    // not just before the panel edge — regardless of each call site's own
    // padding.
    <div className={`relative overflow-hidden ${outerClassName}`} style={{ ...outerStyle, paddingRight: 9 }}>
      <div
        ref={ref}
        onScroll={update}
        className={`hide-native-scrollbar h-full overflow-y-auto ${innerClassName}`}
        style={innerStyle}
      >
        {children}
      </div>
      {thumb && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{ top: thumb.top, height: thumb.height, right: 2, width: 4, backgroundColor: "#C4A882" }}
        />
      )}
    </div>
  );
}

// Gap from the bottom of the taller of the two headers to the summary text.
const CIRCUIT_SPLIT_SUMMARY_MARGIN = 20;

function CircuitSplitPositionPanel({
  position,
  headerRef,
  headerHeight,
}: {
  position: CircuitSplit["positions"][number];
  headerRef: RefObject<HTMLDivElement | null>;
  headerHeight: number | undefined;
}) {
  return (
    <ScrollableRegion outerClassName="h-full min-w-0" innerClassName="flex flex-col px-6 pb-2 pt-[14px]">
      <div ref={headerRef} style={headerHeight !== undefined ? { height: headerHeight } : undefined}>
        <p className="mb-[0.5em] text-center font-serif text-[14px] font-bold text-[#6B6560]">
          {position.label}
        </p>
        <ul className="flex flex-col gap-[0.4em]">
          {position.circuits.map((c) => (
            <li
              key={c.key}
              className="text-[11px] font-normal italic text-[#6B6560]"
              style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
            >
              {c.name} — {c.caseName}
              {c.citation ? `, ${c.citation}` : ""} ({c.year})
            </li>
          ))}
        </ul>
      </div>
      <p
        className="text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{
          fontFamily: "'Lora', Georgia, serif",
          lineHeight: 1.6,
          marginTop: CIRCUIT_SPLIT_SUMMARY_MARGIN,
        }}
      >
        {position.summary}
      </p>
    </ScrollableRegion>
  );
}

// Renders both split positions side by side, measuring each one's header
// (subtitle + circuit citations) and pinning both to the height of the
// taller one, so both summary paragraphs start from the same shared
// baseline — the bottom of whichever header is lowest — plus an identical
// fixed margin.
function CircuitSplitPositionsRow({ positions }: { positions: CircuitSplit["positions"] }) {
  const ref0 = useRef<HTMLDivElement>(null);
  const ref1 = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const h0 = ref0.current?.getBoundingClientRect().height ?? 0;
    const h1 = ref1.current?.getBoundingClientRect().height ?? 0;
    setHeaderHeight(Math.max(h0, h1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  return (
    <div
      className="grid min-h-0 grid-cols-1 gap-y-4 overflow-hidden md:grid-cols-2 md:gap-x-12 md:gap-y-0"
      style={{ flex: "1 1 0%" }}
    >
      {positions[0] && (
        <CircuitSplitPositionPanel position={positions[0]} headerRef={ref0} headerHeight={headerHeight} />
      )}
      {positions[1] && (
        <CircuitSplitPositionPanel position={positions[1]} headerRef={ref1} headerHeight={headerHeight} />
      )}
    </div>
  );
}

// Spans the grid positions of panels 2 and 3 (same as CaseFlowingTextPanel),
// but subdivides that space vertically: panel 4 on top, sized to fit its own
// text (symmetric 14px top/bottom padding, capped at its old 2/7 max-height),
// then panels 2 and 3 side by side underneath, growing to absorb whatever
// space panel 4 doesn't use. Starts at the same top edge and stays inside
// the same fixed-height row — nothing below it moves.
function CaseCircuitSplitLayout({ split }: { split: CircuitSplit }) {
  return (
    <div className="flex h-full min-w-0 min-h-0 flex-col gap-y-3 overflow-hidden md:col-span-2">
      <ScrollableRegion
        outerClassName="min-h-0"
        outerStyle={{
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: "auto",
          // 2/7 was this panel's fixed share before it became content-sized —
          // keep it as a ceiling so very long text can't crowd out panels 2/3.
          maxHeight: "28.5714%",
        }}
        innerClassName="px-6"
        innerStyle={{ paddingTop: 14, paddingBottom: 14 }}
      >
        <p className="mb-[0.5em] text-left font-serif text-[14px] font-bold text-[#6B6560]">
          Split Overview
        </p>
        <p
          className="text-[13px] font-normal not-italic text-[#1A1A1A]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 }}
        >
          {split.description}
        </p>
      </ScrollableRegion>
      <CircuitSplitPositionsRow positions={split.positions} />
    </div>
  );
}

function PartyArgumentPanel({ party }: { party: PartyArgument }) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="text-center font-serif text-[14px] font-bold text-[#6B6560]">{party.party}</p>
      <p
        className="mb-[1em] text-center text-[11px] font-normal not-italic uppercase tracking-wider text-[#6B6560]"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        {party.role}
      </p>
      <ScrollableRegion outerClassName="min-h-0 flex-1" innerClassName="">
        <p
          className="mb-[1em] text-[13px] font-normal not-italic text-[#1A1A1A]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 }}
        >
          {party.coreArgument}
        </p>
        <ul className="flex list-disc flex-col gap-[0.5em] pl-[1.2em]">
          {party.supportingPoints.map((pt, i) => (
            <li
              key={i}
              className="text-[12px] font-normal not-italic text-[#1A1A1A]"
              style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
            >
              {pt}
            </li>
          ))}
        </ul>
      </ScrollableRegion>
    </div>
  );
}

function PartyExchangesPanel({ party }: { party: PartyArgument }) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.5em] text-left font-serif text-[14px] font-bold text-[#6B6560]">
        Key Exchanges with Justices
      </p>
      <ScrollableRegion outerClassName="min-h-0 flex-1" innerClassName="">
        {party.keyExchanges.length === 0 ? (
          <p
            className="text-[13px] font-normal italic text-[#6B6560]"
            style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 }}
          >
            No key exchanges recorded.
          </p>
        ) : (
          <div className="flex flex-col gap-[1em]">
            {party.keyExchanges.map((ex, i) => (
              <div key={i}>
                <p
                  className="text-[12px] font-normal not-italic text-[#1A1A1A]"
                  style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                >
                  {ex.justice}
                </p>
                <p
                  className="text-[13px] font-normal italic text-[#1A1A1A]"
                  style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 }}
                >
                  &ldquo;{ex.question}&rdquo;
                </p>
                <p
                  className="text-[12px] font-normal not-italic text-[#6B6560]"
                  style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                >
                  {ex.significance}
                </p>
              </div>
            ))}
          </div>
        )}
      </ScrollableRegion>
    </div>
  );
}

function PrecedentEntry({ precedent }: { precedent: CitedPrecedent }) {
  return (
    <div className="mb-[1em]">
      <p
        className="text-[13px] font-bold not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.4 }}
      >
        {precedent.caseName}
      </p>
      <p
        className="text-[11px] font-normal italic text-[#6B6560]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
      >
        {precedent.citation}
      </p>
      <p
        className="mt-[0.3em] text-[12px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
      >
        {precedent.reasonCited}
      </p>
    </div>
  );
}

// Half the precedents live in panel 2, half in panel 3 — the same scroll
// treatment as everywhere else, split evenly with any odd one-out going to
// panel 3.
function PrecedentListPanel({ precedents }: { precedents: CitedPrecedent[] }) {
  return (
    <ScrollableRegion outerClassName="h-full min-w-0" innerClassName="px-6 pb-2 pt-[14px]">
      {precedents.map((p) => (
        <PrecedentEntry key={p.caseSlug} precedent={p} />
      ))}
    </ScrollableRegion>
  );
}

function CaseArticleEntry({ article }: { article: Article }) {
  return (
    <div className="mb-[1em]">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[13px] font-bold not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.4 }}
      >
        {article.title}
      </a>
      <p
        className="text-[11px] font-normal italic text-[#6B6560]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
      >
        {article.source}
        {article.author ? ` · ${article.author}` : ""} · {article.publishedAt}
      </p>
      <p
        className="mt-[0.3em] text-[12px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
      >
        {article.summary}
      </p>
    </div>
  );
}

// Half the articles live in panel 2, half in panel 3 — same split rule and
// same scroll treatment as Precedent Cases Cited.
function CaseArticleListPanel({ articles }: { articles: Article[] }) {
  return (
    <ScrollableRegion outerClassName="h-full min-w-0" innerClassName="px-6 pb-2 pt-[14px]">
      {articles.map((a) => (
        <CaseArticleEntry key={a.id} article={a} />
      ))}
    </ScrollableRegion>
  );
}

// `detail` renders the specific parts a concur/dissent author concurred or
// dissented to (e.g. "Parts I-III and V"), in italics next to their name —
// only when that data exists. It never does today: data/cases/*.json has
// no structured field for which parts of an opinion a partial join covers
// (Supabase's decision_ties.join_scope_detail column mirrors this same gap
// and is always written empty). Never inferred from the prose summaries.
function JusticeNameRow({ justiceKey, detail }: { justiceKey: string; detail?: string }) {
  const justice = CASE_PANEL_JUSTICES[justiceKey];
  if (!justice) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Image
        src={justice.photo}
        alt={justice.displayName}
        width={20}
        height={20}
        className="shrink-0 rounded-full object-cover object-top"
        style={{ width: 20, height: 20 }}
      />
      <p
        className="truncate text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.4 }}
      >
        {justice.displayName}
        {detail ? <span className="italic text-[#6B6560]"> — {detail}</span> : null}
      </p>
    </div>
  );
}

function JusticeLabel({ children, indent }: { children: ReactNode; indent?: boolean }) {
  return (
    <p
      className={`mb-[0.3em] mt-[0.6em] text-[11px] font-normal uppercase tracking-wider not-italic text-[#6B6560] ${
        indent ? "pl-[28px]" : ""
      }`}
      style={{ fontFamily: "'Lora', Georgia, serif" }}
    >
      {children}
    </p>
  );
}

// "Full Text" / "Synopsis" — shown to the right of an opinion's author only
// when that data actually exists (e.g. Alito's concurrence in Trump v.
// Barbara has no stored summary, so its Synopsis button simply doesn't
// render rather than pointing at empty text).
function OpinionActionButtons({
  fullTextUrl,
  hasSynopsis,
  isSelected,
  onSelectSynopsis,
}: {
  fullTextUrl?: string;
  hasSynopsis?: boolean;
  isSelected?: boolean;
  onSelectSynopsis?: () => void;
}) {
  if (!fullTextUrl && !hasSynopsis) return null;
  return (
    <div className="flex shrink-0 items-center gap-[0.8em]">
      {fullTextUrl && (
        <a
          href={fullTextUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-normal uppercase tracking-wider text-[#6B6560] transition-colors hover:text-[#C43030]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Full Text
        </a>
      )}
      {hasSynopsis && (
        <button
          type="button"
          onClick={onSelectSynopsis}
          className="text-[11px] uppercase tracking-wider text-[#6B6560] transition-colors hover:text-[#C43030]"
          style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: isSelected ? 700 : 400 }}
        >
          Synopsis
        </button>
      )}
    </div>
  );
}

// A justice's name/portrait row plus its Full Text / Synopsis buttons — used
// for actual opinion authors. Plain `JusticeNameRow` (no buttons) still
// covers "Joined By" entries, which aren't opinion authors themselves.
function OpinionAuthorRow({
  authorKey,
  partDetail,
  fullTextUrl,
  hasSynopsis,
  isSynopsisSelected,
  onSelectSynopsis,
}: {
  authorKey: string;
  partDetail?: string;
  fullTextUrl?: string;
  hasSynopsis?: boolean;
  isSynopsisSelected?: boolean;
  onSelectSynopsis?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <JusticeNameRow justiceKey={authorKey} detail={partDetail} />
      <OpinionActionButtons
        fullTextUrl={fullTextUrl}
        hasSynopsis={hasSynopsis}
        isSelected={isSynopsisSelected}
        onSelectSynopsis={onSelectSynopsis}
      />
    </div>
  );
}

// One separately-authored opinion (a concurrence, dissent, or concur/
// dissent): its own author, then who joined THAT specific opinion without
// writing their own — sourced from that opinion's summary.joinedBy, per
// computeDecisionSides's own data model (per-panel convention: never show
// an empty "Joined By" section).
function OpinionAuthorBlock({
  authorKey,
  joinedBy,
  partDetail,
  fullTextUrl,
  hasSynopsis,
  isSynopsisSelected,
  onSelectSynopsis,
}: {
  authorKey: string;
  joinedBy: string[];
  partDetail?: string;
  fullTextUrl?: string;
  hasSynopsis?: boolean;
  isSynopsisSelected?: boolean;
  onSelectSynopsis?: () => void;
}) {
  return (
    <div className="mb-[0.6em]">
      <OpinionAuthorRow
        authorKey={authorKey}
        partDetail={partDetail}
        fullTextUrl={fullTextUrl}
        hasSynopsis={hasSynopsis}
        isSynopsisSelected={isSynopsisSelected}
        onSelectSynopsis={onSelectSynopsis}
      />
      {joinedBy.length > 0 && (
        <>
          <JusticeLabel indent>Joined By</JusticeLabel>
          <div className="flex flex-col gap-[0.3em] pl-[28px]">
            {joinedBy.map((key) => (
              <JusticeNameRow key={key} justiceKey={key} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DecisionMajorityPanel({
  caseData,
  selectionKey,
  onSelectSynopsis,
}: {
  caseData: CaseSummary;
  selectionKey: string;
  onSelectSynopsis: (key: string) => void;
}) {
  const authorKey = caseData.majorityAuthor;
  const author = authorKey ? CASE_PANEL_JUSTICES[authorKey] : undefined;
  const pdfUrl = extractOpinionPdfUrl(caseData.outcome);

  // Single source of truth for who's on which side and what their precise
  // role is — same function the Supabase decisions/decision_ties tables
  // are computed from (scripts/lib/sd-db/decisions.ts), so this panel and
  // the database can't drift apart.
  const sides = computeDecisionSides(caseData);

  // Majority "Joined By": justices computeDecisionSides placed on the
  // winning side with no more specific role (not the author, not a
  // concurrence/concur-dissent writer or joiner, not a plurality-only
  // member) — i.e. silent majority joiners.
  const joinedByMajority = sides.winningSide
    .filter((e) => e.roleLabel === null)
    .map((e) => e.key);

  // "Concurred" holds both pure concurrence authors and concur/dissent
  // authors (concurring in part, dissenting in part) — per design
  // decision, concur/dissent doesn't get its own section; it's folded in
  // here, with its distinguishing detail meant to render as italic text
  // next to the name (see JusticeNameRow's `detail` prop). Merged in
  // seniority order since computeDecisionSides keeps the two categories
  // in separate arrays.
  const concurringAuthorKeys = new Set(
    sides.winningSide.filter((e) => e.roleLabel === "Concurring opinion").map((e) => e.key)
  );
  const concurDissentAuthorKeys = new Set(
    sides.concurDissentSide
      .filter((e) => e.roleLabel === "Concurring in part, dissenting in part")
      .map((e) => e.key)
  );
  const concurredAuthorKeys = JUSTICE_ORDER.filter(
    (key) => concurringAuthorKeys.has(key) || concurDissentAuthorKeys.has(key)
  );

  // Plurality has two independent parts, because computeDecisionSides
  // collapses them independently:
  //  - The AUTHOR row only shows when the plurality author is a genuinely
  //    separate coalition from the majority author. When they're the same
  //    justice (the common case — see decisionSides.ts's own comment),
  //    that person is classified as "Majority opinion" only, with no
  //    "Plurality opinion" role, and is already shown in Author above —
  //    repeating them here would be redundant.
  //  - The JOINED BY list is NOT tied to that collapse: a justice who
  //    joined only the narrower plurality coalition (not the full
  //    majority) keeps a distinct "Joined plurality opinion" role even
  //    when the plurality author is the majority author. Confirmed
  //    against real data (24-5774-barrett-v-united-states.json), where
  //    Roberts/Sotomayor/Kagan joined only Jackson's narrower plurality
  //    coalition while Jackson herself renders as the plain majority
  //    author — dropping this list because the author row collapsed
  //    would silently lose those three justices from the panel entirely.
  const pluralityAuthorKey = caseData.pluralityAuthor;
  const showPluralityAuthorRow = sides.winningSide.some(
    (e) => e.key === pluralityAuthorKey && e.roleLabel === "Plurality opinion"
  );
  const pluralityJoinedBy = sides.winningSide
    .filter((e) => e.roleLabel === "Joined plurality opinion")
    .map((e) => e.key);
  const showPlurality = showPluralityAuthorRow || pluralityJoinedBy.length > 0;

  // Dissent: pure dissent authors only (concur/dissent authors are routed
  // into "Concurred" above, per design decision — computeDecisionSides
  // already keeps them out of losingSide).
  const dissentAuthorKeys = sides.losingSide
    .filter((e) => e.roleLabel === "Dissenting opinion")
    .map((e) => e.key);

  return (
    <ScrollableRegion outerClassName="h-full min-w-0" innerClassName="px-6 pb-2 pt-[14px]">
      <p className="mb-[0.5em] text-left font-serif text-[14px] font-bold text-[#6B6560]">
        Majority
      </p>
      <JusticeLabel>Author</JusticeLabel>
      {author ? (
        <OpinionAuthorRow
          authorKey={authorKey as string}
          fullTextUrl={pdfUrl}
          hasSynopsis={Boolean(caseData.majorityOpinionSummary)}
          isSynopsisSelected={selectionKey === "majority"}
          onSelectSynopsis={() => onSelectSynopsis("majority")}
        />
      ) : (
        <p
          className="text-[13px] font-normal italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          {sides.isPerCuriam ? "Per Curiam" : "Unknown"}
        </p>
      )}
      {authorKey && !sides.isPerCuriam && joinedByMajority.length > 0 && (
        <>
          <JusticeLabel>Joined By</JusticeLabel>
          <div className="flex flex-col gap-[0.4em]">
            {joinedByMajority.map((key) => (
              <JusticeNameRow key={key} justiceKey={key} />
            ))}
          </div>
        </>
      )}
      {concurredAuthorKeys.length > 0 && (
        <>
          <JusticeLabel>Concurred</JusticeLabel>
          {concurredAuthorKeys.map((key) => {
            const isConcurDissent = concurDissentAuthorKeys.has(key);
            const summary = isConcurDissent
              ? caseData.concurDissentSummaries?.find((s) => s.author === key)
              : caseData.concurringSummaries?.find((s) => s.author === key);
            return (
              <OpinionAuthorBlock
                key={key}
                authorKey={key}
                joinedBy={summary?.joinedBy ?? []}
                fullTextUrl={pdfUrl}
                hasSynopsis={Boolean(summary?.summary)}
                isSynopsisSelected={
                  selectionKey === `${isConcurDissent ? "concur-dissent" : "concurrence"}:${key}`
                }
                onSelectSynopsis={() =>
                  onSelectSynopsis(`${isConcurDissent ? "concur-dissent" : "concurrence"}:${key}`)
                }
              />
            );
          })}
        </>
      )}
      {showPlurality && (
        <>
          <p className="mb-[0.5em] mt-[0.75em] text-left font-serif text-[14px] font-bold text-[#6B6560]">
            Plurality
          </p>
          {showPluralityAuthorRow && pluralityAuthorKey ? (
            <>
              <JusticeLabel>Author</JusticeLabel>
              <OpinionAuthorBlock authorKey={pluralityAuthorKey} joinedBy={pluralityJoinedBy} />
            </>
          ) : (
            pluralityJoinedBy.length > 0 && (
              <>
                <JusticeLabel>Joined By</JusticeLabel>
                <div className="flex flex-col gap-[0.4em]">
                  {pluralityJoinedBy.map((key) => (
                    <JusticeNameRow key={key} justiceKey={key} />
                  ))}
                </div>
              </>
            )
          )}
        </>
      )}
      {dissentAuthorKeys.length > 0 && (
        <>
          <p className="mb-[0.5em] mt-[0.75em] text-left font-serif text-[14px] font-bold text-[#6B6560]">
            Dissent
          </p>
          {dissentAuthorKeys.map((key) => {
            const summary = caseData.dissentSummaries?.find((s) => s.author === key);
            return (
              <OpinionAuthorBlock
                key={key}
                authorKey={key}
                joinedBy={summary?.joinedBy ?? []}
                fullTextUrl={pdfUrl}
                hasSynopsis={Boolean(summary?.summary)}
                isSynopsisSelected={selectionKey === `dissent:${key}`}
                onSelectSynopsis={() => onSelectSynopsis(`dissent:${key}`)}
              />
            );
          })}
        </>
      )}
    </ScrollableRegion>
  );
}

function getSynopsisForSelection(
  caseData: CaseSummary,
  selectionKey: string
): { authorKey: string; roleLabel: string; text: string } | undefined {
  if (selectionKey === "majority") {
    if (!caseData.majorityOpinionSummary) return undefined;
    return {
      authorKey: caseData.majorityAuthor ?? "",
      roleLabel: "Majority Opinion",
      text: caseData.majorityOpinionSummary,
    };
  }
  if (selectionKey.startsWith("concurrence:")) {
    const authorKey = selectionKey.slice("concurrence:".length);
    const summary = caseData.concurringSummaries?.find((s) => s.author === authorKey)?.summary;
    if (!summary) return undefined;
    return { authorKey, roleLabel: "Concurrence", text: summary };
  }
  if (selectionKey.startsWith("dissent:")) {
    const authorKey = selectionKey.slice("dissent:".length);
    const summary = caseData.dissentSummaries?.find((s) => s.author === authorKey)?.summary;
    if (!summary) return undefined;
    return { authorKey, roleLabel: "Dissent", text: summary };
  }
  if (selectionKey.startsWith("concur-dissent:")) {
    const authorKey = selectionKey.slice("concur-dissent:".length);
    const summary = caseData.concurDissentSummaries?.find((s) => s.author === authorKey)?.summary;
    if (!summary) return undefined;
    return { authorKey, roleLabel: "Concurring in Part, Dissenting in Part", text: summary };
  }
  return undefined;
}

function DecisionSynopsisPanel({
  caseData,
  selectionKey,
}: {
  caseData: CaseSummary;
  selectionKey: string;
}) {
  const selection = getSynopsisForSelection(caseData, selectionKey);
  const author = selection?.authorKey ? CASE_PANEL_JUSTICES[selection.authorKey] : undefined;
  const paragraphs = selection ? selection.text.split("\n\n") : [];

  return (
    <ScrollableRegion outerClassName="h-full min-w-0" innerClassName="px-6 pb-2 pt-[14px]">
      <p className="mb-[0.5em] text-left font-serif text-[14px] font-bold text-[#6B6560]">
        Synopsis
      </p>
      {selection ? (
        <>
          <p
            className="mb-[1em] text-[13px] font-normal italic text-[#6B6560]"
            style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
          >
            {selection.roleLabel}
            {author ? ` — ${author.displayName}` : ""}
          </p>
          {paragraphs.map((para, i) => (
            <p
              key={i}
              className="mb-[1em] text-[13px] font-normal not-italic text-[#1A1A1A]"
              style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7, textIndent: "1.5em" }}
            >
              {para}
            </p>
          ))}
        </>
      ) : (
        <p
          className="text-[13px] font-normal italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 }}
        >
          No synopsis available.
        </p>
      )}
    </ScrollableRegion>
  );
}

// Holds which opinion's synopsis is showing in panel 3 — defaults to the
// majority synopsis, per the standard "Decisions & Opinions" landing state.
function DecisionOpinionsLayout({ caseData }: { caseData: CaseSummary }) {
  const [selectionKey, setSelectionKey] = useState("majority");
  return (
    <>
      <DecisionMajorityPanel
        caseData={caseData}
        selectionKey={selectionKey}
        onSelectSynopsis={setSelectionKey}
      />
      <DecisionSynopsisPanel caseData={caseData} selectionKey={selectionKey} />
    </>
  );
}

// Spans the grid positions of panels 2 and 3, letting long text flow from
// the first "column" into the second exactly like two panels of text.
// columnFill: "auto" fills column one completely before spilling into
// column two, instead of the browser's default of balancing both evenly.
function CaseFlowingTextPanel({ title, text }: { title: string; text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <ScrollableRegion
      outerClassName="h-full min-w-0 md:col-span-2"
      innerClassName="px-6 pb-2 pt-[14px]"
      innerStyle={{ columnCount: 2, columnGap: "48px", columnFill: "auto" }}
    >
      <p className="mb-[0.5em] text-left font-serif text-[14px] font-bold text-[#6B6560]">
        {title}
      </p>
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className="mb-[1em] text-[13px] font-normal not-italic text-[#1A1A1A]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7, textIndent: "1.5em" }}
        >
          {para}
        </p>
      ))}
    </ScrollableRegion>
  );
}

function CaseOverviewPanel({
  caseData,
  menuItems,
  selectedItem,
  onSelectItem,
}: {
  caseData: CaseSummary;
  menuItems: string[];
  selectedItem: string | null;
  onSelectItem: (item: string) => void;
}) {
  const status = getCaseDocketStatus(caseData);
  const statusLabel = status === "upcoming" ? "Scheduled" : status === "argued" ? "Argued" : "Decided";
  const statusDate = status === "decided" ? caseData.decisionDate : caseData.argumentDate;

  return (
    <ScrollableRegion outerClassName="h-full min-w-0" innerClassName="flex flex-col px-6 pb-2 pt-[14px]">
      <p className="font-serif text-[20px] font-bold not-italic leading-tight text-[#1A1A1A]">
        {caseData.title}
      </p>
      <p
        className="mt-[0.5em] text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
      >
        {caseData.termYear} Term
      </p>
      <p
        className="text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
      >
        {caseData.caseNumber}
      </p>
      <p
        className="text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
      >
        {statusLabel}
        {statusDate ? ` ${formatDate(statusDate)}` : ""}
      </p>
      {caseData.podcastEpisodeUrl && (
        <a
          href={caseData.podcastEpisodeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
        >
          Listen on Spotify
        </a>
      )}
      <p className="mb-[0.5em] mt-[16px] text-left font-serif text-[14px] font-bold text-[#6B6560]">
        Core Question
      </p>
      <p
        className="text-[13px] font-normal italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
      >
        {caseData.legalQuestion}
      </p>
      <p className="mb-[0.5em] mt-[16px] text-left font-serif text-[14px] font-bold text-[#6B6560]">
        Menu
      </p>
      <div className="min-h-0 flex-1">
        <ul
          className="grid list-none grid-cols-2 gap-x-4 gap-y-[0.4em]"
          style={{
            gridTemplateRows: `repeat(${Math.ceil(menuItems.length / 2)}, auto)`,
            gridAutoFlow: "column",
          }}
        >
          {menuItems.map((item) => (
            <li key={item}>
              <button
                type="button"
                onClick={() => onSelectItem(item)}
                className="text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  lineHeight: 1.5,
                  fontWeight: selectedItem === item ? 700 : 400,
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ScrollableRegion>
  );
}

export function CaseDetailPanels({
  caseData,
  circuitSplitsBySlug,
  articlesByCaseSlug,
}: {
  caseData: CaseSummary;
  circuitSplitsBySlug: Record<string, CircuitSplit>;
  articlesByCaseSlug: Record<string, Article[]>;
}) {
  const split = circuitSplitsBySlug[caseData.slug];
  const caseArticles = caseData.termYear === "2025" ? articlesByCaseSlug[caseData.slug] ?? [] : [];
  const menuItems = getCaseMenuItems({
    caseData,
    hasCircuitSplit: Boolean(split),
    hasArticles: caseArticles.length > 0,
  });
  const defaultItem = menuItems.includes("Background & Facts")
    ? "Background & Facts"
    : menuItems[0] ?? null;
  const [selectedItem, setSelectedItem] = useState<string | null>(defaultItem);

  const selectedParty =
    selectedItem === "Petitioner"
      ? caseData.parties.find((p) => p.role === "petitioner")
      : selectedItem === "Respondent"
        ? caseData.parties.find((p) => p.role === "respondent")
        : undefined;

  return (
    <>
      <CaseOverviewPanel
        caseData={caseData}
        menuItems={menuItems}
        selectedItem={selectedItem}
        onSelectItem={setSelectedItem}
      />
      {selectedItem === "Background & Facts" ? (
        <CaseFlowingTextPanel title="Background & Facts" text={caseData.backgroundAndFacts} />
      ) : selectedItem === "Why This Case Matters" ? (
        <CaseFlowingTextPanel title="Why This Case Matters" text={caseData.significance} />
      ) : selectedItem === "The Circuit Split" && split ? (
        <CaseCircuitSplitLayout split={split} />
      ) : selectedParty ? (
        <>
          <PartyArgumentPanel party={selectedParty} />
          <PartyExchangesPanel party={selectedParty} />
        </>
      ) : selectedItem === "Precedent Cases Cited" ? (
        <>
          <PrecedentListPanel
            precedents={caseData.citedPrecedents.slice(
              0,
              Math.floor(caseData.citedPrecedents.length / 2)
            )}
          />
          <PrecedentListPanel
            precedents={caseData.citedPrecedents.slice(
              Math.floor(caseData.citedPrecedents.length / 2)
            )}
          />
        </>
      ) : selectedItem === "Third Party Analysis" ? (
        <>
          <CaseArticleListPanel articles={caseArticles.slice(0, Math.floor(caseArticles.length / 2))} />
          <CaseArticleListPanel articles={caseArticles.slice(Math.floor(caseArticles.length / 2))} />
        </>
      ) : selectedItem === "Decisions & Opinions" ? (
        <DecisionOpinionsLayout caseData={caseData} />
      ) : (
        <>
          <CaseScaffoldPanel index={2} selectedItem={selectedItem} />
          <CaseScaffoldPanel index={3} selectedItem={selectedItem} />
        </>
      )}
    </>
  );
}
