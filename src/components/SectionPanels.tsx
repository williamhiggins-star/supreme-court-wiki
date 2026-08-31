"use client";

import { Fragment, useState, useRef, useEffect, useLayoutEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SectionKey } from "@/lib/dashboard2-sections";
import type { CaseSummary, Article } from "@/types";
import type { DecidedItem } from "@/app/page";
import type { JusticeStat } from "@/lib/justices";
import { JUSTICE_KEY_BY_PERSON_SLUG } from "@/lib/db/constants";
import { ScrollableRegion } from "@/components/ScrollableRegion";
import type { OpinionLengthStats, OpinionLengthDetail, JusticeOpinionExtreme, JusticeAgreementPair, OpinionJoinerHighlights, JusticeCaseRef, CasesByCategoryAndJustice, JusticeJoinData, JusticeMajorityMinorityRate } from "@/lib/db/term-stats";

const DOCKET_PAGE_SIZE = 4;
const ARTICLE_PAGE_SIZE = 6;

// Every case title opens the in-place case-panel view (see CaseDetailPanels)
// instead of navigating to /cases/[slug].
function CaseTitleLink({ slug, title, onSelectCase, className = "text-[13px] font-normal not-italic text-[#1A1A1A]", lineHeight = 1.4 }: { slug: string; title: string; onSelectCase: (slug: string) => void; className?: string; lineHeight?: number }) {
  return (
    <button type="button" onClick={() => onSelectCase(slug)} className={`block border-0 bg-transparent p-0 text-left transition-colors hover:text-[#C43030] ${className}`} style={{ fontFamily: "'Lora', Georgia, serif", lineHeight }}>
      {title}
    </button>
  );
}

// Duplicated from src/app/page.tsx (a server component that can't be
// imported into this client component — it pulls in fs-based data helpers).
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The nine sitting justices — matches data/justices.json's key/photo pairing.
const ALL_JUSTICES = [
  {
    key: "roberts",
    displayName: "Chief Justice Roberts",
    photo: "/images/justices/roberts.jpg",
  },
  {
    key: "thomas",
    displayName: "Justice Thomas",
    photo: "/images/justices/thomas.jpg",
  },
  {
    key: "alito",
    displayName: "Justice Alito",
    photo: "/images/justices/alito.jpg",
  },
  {
    key: "sotomayor",
    displayName: "Justice Sotomayor",
    photo: "/images/justices/sotomayor.jpg",
  },
  {
    key: "kagan",
    displayName: "Justice Kagan",
    photo: "/images/justices/kagan.jpg",
  },
  {
    key: "gorsuch",
    displayName: "Justice Gorsuch",
    photo: "/images/justices/gorsuch.jpg",
  },
  {
    key: "kavanaugh",
    displayName: "Justice Kavanaugh",
    photo: "/images/justices/kavanaugh.jpg",
  },
  {
    key: "barrett",
    displayName: "Justice Barrett",
    photo: "/images/justices/barrett.jpg",
  },
  {
    key: "jackson",
    displayName: "Justice Jackson",
    photo: "/images/justices/jackson.jpg",
  },
];

// person.slug (from a term_stats_* view's people(slug) join) -> the
// ALL_JUSTICES entry this UI already keys everything else by.
function resolveJustice(slug: string | null | undefined) {
  if (!slug) return undefined;
  const key = JUSTICE_KEY_BY_PERSON_SLUG[slug];
  return key ? ALL_JUSTICES.find((j) => j.key === key) : undefined;
}

// The reverse of JUSTICE_KEY_BY_PERSON_SLUG -- for going from a JusticeStat's
// app-level key back to the DB person.slug a term_stats_* accessor's data is
// keyed by (e.g. looking up a specific justice's case list once a "most X"
// winner has already been picked from the justices prop).
const PERSON_SLUG_BY_JUSTICE_KEY: Record<string, string> = Object.fromEntries(Object.entries(JUSTICE_KEY_BY_PERSON_SLUG).map(([slug, key]) => [key, slug]));

function JusticePortraitGroup({ majorityAuthor, dissentAuthors }: { majorityAuthor?: string; dissentAuthors: string[] }) {
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    name: string;
  } | null>(null);
  const hoverHandlers = (name: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY, name }),
    onMouseMove: (e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY, name }),
    onMouseLeave: () => setHover(null),
  });

  if (!majorityAuthor) {
    return (
      <p className="text-[11px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        —
      </p>
    );
  }
  const dissentSet = new Set(dissentAuthors);
  const majority = ALL_JUSTICES.filter((j) => !dissentSet.has(j.key));
  const dissent = ALL_JUSTICES.filter((j) => dissentSet.has(j.key));

  return (
    <div className="flex flex-col gap-[0.5em]">
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{
            left: hover.x,
            top: hover.y - 10,
            fontFamily: "'Lora', Georgia, serif",
          }}
        >
          {hover.name}
        </span>
      )}
      <div>
        <p className="mb-0.5 text-[9px] font-normal uppercase tracking-wider not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {majorityAuthor === "per_curiam" ? "Per Curiam" : dissent.length === 0 ? "Unanimous" : "Majority"}
        </p>
        <div className="flex flex-wrap gap-1">
          {majority.map((j) => (
            <Image key={j.key} src={j.photo} alt={j.displayName} width={16} height={16} className="rounded-full object-cover object-top" style={{ width: 16, height: 16 }} {...hoverHandlers(j.displayName)} />
          ))}
        </div>
      </div>
      {dissent.length > 0 && (
        <div>
          <p className="mb-0.5 text-[9px] font-normal uppercase tracking-wider not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            Dissent
          </p>
          <div className="flex flex-wrap gap-1">
            {dissent.map((j) => (
              <Image key={j.key} src={j.photo} alt={j.displayName} width={16} height={16} className="rounded-full object-cover object-top" style={{ width: 16, height: 16 }} {...hoverHandlers(j.displayName)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JusticeDualBarRow({ justice: j, maxMinutes, maxQuestions }: { justice: JusticeStat; maxMinutes: number; maxQuestions: number }) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="mb-[0.8em] flex items-center gap-2" onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)}>
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{
            left: hover.x,
            top: hover.y - 10,
            fontFamily: "'Lora', Georgia, serif",
          }}
        >
          {j.displayName}
        </span>
      )}
      <Image src={j.photo} alt={j.displayName} width={20} height={20} className="shrink-0 rounded-full object-cover object-top" style={{ width: 20, height: 20 }} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(j.estimatedMinutes / maxMinutes) * 100}%`,
                backgroundColor: "#C43030",
              }}
            />
          </div>
          <p className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {j.estimatedMinutes.toLocaleString()} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(j.questions / maxQuestions) * 100}%`,
                backgroundColor: "#2C4A3E",
              }}
            />
          </div>
          <p className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {j.questions.toLocaleString()} turns
          </p>
        </div>
      </div>
    </div>
  );
}

function JusticesSpeakingPanel({ justices }: { justices: JusticeStat[] }) {
  const maxMinutes = Math.max(1, ...justices.map((j) => j.estimatedMinutes));
  const maxQuestions = Math.max(1, ...justices.map((j) => j.questions));
  const sorted = [...justices].sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Speaking Time &amp; Turns</p>
      <div className="min-h-0 flex-1 overflow-hidden">
        {sorted.map((j) => (
          <JusticeDualBarRow key={j.key} justice={j} maxMinutes={maxMinutes} maxQuestions={maxQuestions} />
        ))}
      </div>
    </div>
  );
}

function JusticeOpinionRow({ justice: j, maxOpinions }: { justice: JusticeStat; maxOpinions: number }) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const total = j.majorityOpinions + j.concurrences + j.dissents;
  const barPct = (total / maxOpinions) * 100;
  const majPct = total > 0 ? (j.majorityOpinions / total) * 100 : 0;
  const concPct = total > 0 ? (j.concurrences / total) * 100 : 0;
  const disPct = total > 0 ? (j.dissents / total) * 100 : 0;

  return (
    <div className="mb-[0.6em] flex items-center gap-2" onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)}>
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{
            left: hover.x,
            top: hover.y - 10,
            fontFamily: "'Lora', Georgia, serif",
          }}
        >
          {j.displayName}
        </span>
      )}
      <Image src={j.photo} alt={j.displayName} width={20} height={20} className="shrink-0 rounded-full object-cover object-top" style={{ width: 20, height: 20 }} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
          <div className="flex h-full" style={{ width: `${barPct}%` }}>
            {j.majorityOpinions > 0 && <div className="h-full" style={{ width: `${majPct}%`, backgroundColor: "#2C4A3E" }} />}
            {j.concurrences > 0 && <div className="h-full" style={{ width: `${concPct}%`, backgroundColor: "#8B6914" }} />}
            {j.dissents > 0 && <div className="h-full" style={{ width: `${disPct}%`, backgroundColor: "#C43030" }} />}
          </div>
        </div>
        <p className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {total} op{total !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

function JusticesOpinionsPanel({ justices }: { justices: JusticeStat[] }) {
  const maxOpinions = Math.max(1, ...justices.map((j) => j.majorityOpinions + j.concurrences + j.dissents));
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Opinions</p>
      <div className="min-h-0 flex-1 overflow-hidden">
        {justices.map((j) => (
          <JusticeOpinionRow key={j.key} justice={j} maxOpinions={maxOpinions} />
        ))}
      </div>
      <div className="mt-[0.4em] flex items-center justify-center gap-3">
        <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#2C4A3E" }} />
          Majority
        </span>
        <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#8B6914" }} />
          Concurring
        </span>
        <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#C43030" }} />
          Dissenting
        </span>
      </div>
    </div>
  );
}

// Opinions section, panel 1: a menu panel (same role as CaseOverviewPanel's
// "Menu" in CaseDetailPanels.tsx) that lets the user pick which opinion-stat
// data set panels 2 and 3 show. "Length" is a non-selectable category
// header over its own two selectable children (Longest/Shortest); "Volume"
// is a plain top-level selectable item with no children.
const OPINIONS_MENU: { label: string; children?: readonly string[] }[] = [
  { label: "Length", children: ["Longest", "Shortest"] },
  { label: "Volume", children: ["All", "Concurrences and Dissents"] },
  { label: "Alignment", children: ["All Votes", "Joiners"] },
  { label: "Justices", children: ALL_JUSTICES.map((j) => j.displayName) },
];
export const DEFAULT_OPINIONS_ITEM = "Longest";

function OpinionsMenuItemButton({ item, selectedItem, onSelectItem }: { item: string; selectedItem: string | null; onSelectItem: (item: string) => void }) {
  const isSelected = selectedItem === item;
  return (
    <button
      type="button"
      onClick={() => onSelectItem(item)}
      className={`text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030] ${isSelected ? "underline" : ""}`}
      style={{
        fontFamily: "'Lora', Georgia, serif",
        lineHeight: 1.5,
        // Baseline is 400 weight; selected is 2x the weight (800).
        fontWeight: isSelected ? 800 : 400,
      }}
    >
      {item}
    </button>
  );
}

// One top-level Opinions-menu entry (label + its children). "Justices" gets
// its children split into two sub-columns with a portrait next to each
// justice; every other entry's children are a single plain column.
function OpinionsMenuEntry({ label, children, selectedItem, onSelectItem }: { label: string; children?: readonly string[]; selectedItem: string | null; onSelectItem: (item: string) => void }) {
  return (
    <div className="mb-[0.4em]">
      {children ? (
        <button
          type="button"
          onClick={() => onSelectItem(children[0])}
          className="text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
          style={{
            fontFamily: "'Lora', Georgia, serif",
            lineHeight: 1.5,
            fontWeight: 400,
          }}
        >
          {label}
        </button>
      ) : (
        <OpinionsMenuItemButton item={label} selectedItem={selectedItem} onSelectItem={onSelectItem} />
      )}
      {children && label === "Justices" ? (
        <div className="flex gap-x-4 pl-[12px]">
          {[children.slice(0, Math.ceil(children.length / 2)), children.slice(Math.ceil(children.length / 2))].map((col, i) => (
            <ul key={i} className="list-none">
              {col.map((child) => {
                const justice = ALL_JUSTICES.find((j) => j.displayName === child);
                return (
                  <li key={child} className="mt-[0.3em] flex items-center gap-x-[6px]">
                    {justice && (
                      <Image
                        src={justice.photo}
                        alt={justice.displayName}
                        width={16}
                        height={16}
                        className="rounded-full object-cover object-top"
                        style={{ width: 16, height: 16 }}
                      />
                    )}
                    <OpinionsMenuItemButton item={child} selectedItem={selectedItem} onSelectItem={onSelectItem} />
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      ) : (
        children && (
          <ul className="list-none pl-[12px]">
            {children.map((child) => (
              <li key={child} className="mt-[0.3em]">
                <OpinionsMenuItemButton item={child} selectedItem={selectedItem} onSelectItem={onSelectItem} />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function OpinionsMenuPanel({ selectedItem, onSelectItem }: { selectedItem: string | null; onSelectItem: (item: string) => void }) {
  const menuByLabel = Object.fromEntries(OPINIONS_MENU.map((m) => [m.label, m]));

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-[#F2EDE3] px-6 pb-2 pt-[14px]">
      <p className="font-serif text-[20px] font-normal not-italic leading-tight text-[#1A1A1A]">Opinions Data</p>
      <p className="mt-[0.4em] text-[13px] font-normal italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}>
        2025-6 Term
      </p>
      <p className="mb-[0.5em] mt-[16px] text-left font-serif text-[14px] font-bold text-[#1A1A1A]">Menu</p>
      {/* Row 1: Length + Alignment side by side. Row 2: Volume alone. Row 3: Justices alone (its own children in two columns, handled by OpinionsMenuEntry). */}
      <div className="flex gap-x-6">
        <OpinionsMenuEntry {...menuByLabel["Length"]} selectedItem={selectedItem} onSelectItem={onSelectItem} />
        <OpinionsMenuEntry {...menuByLabel["Alignment"]} selectedItem={selectedItem} onSelectItem={onSelectItem} />
      </div>
      <OpinionsMenuEntry {...menuByLabel["Volume"]} selectedItem={selectedItem} onSelectItem={onSelectItem} />
      <OpinionsMenuEntry {...menuByLabel["Justices"]} selectedItem={selectedItem} onSelectItem={onSelectItem} />
    </div>
  );
}

// A single justice's small circular portrait + name -- used for both an
// opinion's author and its joiners, per the "always show the portrait with
// the name" rule for this section.
function JusticeChip({ justice }: { justice: (typeof ALL_JUSTICES)[number] }) {
  return (
    <div className="flex items-center gap-1.5">
      <Image src={justice.photo} alt={justice.displayName} width={18} height={18} className="shrink-0 rounded-full object-cover object-top" style={{ width: 18, height: 18 }} />
      <p className="text-[11px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        {justice.displayName}
      </p>
    </div>
  );
}

// opinions.kind -> a short display label, for annotating "Longest Opinion"
// with what kind it actually turned out to be (it could be any kind --
// majority/concurrence/dissent already have their own dedicated cards).
const OPINION_KIND_LABELS: Record<string, string> = {
  majority: "Majority",
  plurality: "Plurality",
  concurrence: "Concurrence",
  concurrence_in_judgment: "Concurrence",
  concurrence_in_part: "Concurrence",
  concur_dissent: "Concur/Dissent",
  dissent: "Dissent",
  dissent_in_part: "Dissent",
  per_curiam: "Per Curiam",
};

function opinionKindLabel(kind: string): string {
  return OPINION_KIND_LABELS[kind] ?? kind;
}

// opinions.kind -> the bar color for the Longest/Shortest-by-justice
// charts -- majority (incl. plurality) green, concurrence tan, dissent
// (incl. concur/dissent) red. Keyed off the same display label as
// opinionKindLabel so the two stay in sync.
const OPINION_KIND_COLOR: Record<string, string> = {
  Majority: "#2C4A3E",
  Plurality: "#2C4A3E",
  Concurrence: "#C4A882",
  Dissent: "#C43030",
  "Concur/Dissent": "#C43030",
};

function opinionKindColor(kind: string): string {
  return OPINION_KIND_COLOR[opinionKindLabel(kind)] ?? "#6B6560";
}

// One opinion's case title, word count, and author/joiner justice chips --
// the shared card for every "longest X opinion" slot in the Length menu.
function OpinionLengthCard({ detail, onSelectCase }: { detail: OpinionLengthDetail | null; onSelectCase: (slug: string) => void }) {
  if (!detail) {
    return (
      <p className="text-[12px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        No data.
      </p>
    );
  }
  const author = resolveJustice(detail.authorSlug);
  const joiners = detail.joinerSlugs.map((slug) => resolveJustice(slug)).filter((j): j is (typeof ALL_JUSTICES)[number] => j !== undefined);

  return (
    <div className="ml-[5px]">
      <p className="text-[13px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.4 }}>
        {detail.wordCount.toLocaleString()} words
      </p>
      <CaseTitleLink slug={detail.caseSlug} title={detail.caseCaption} onSelectCase={onSelectCase} className="text-[11px] font-normal not-italic text-[#6B6560]" lineHeight={1.5} />
      {(author || joiners.length > 0) && (
        <div className="mt-[0.4em] flex flex-col gap-[0.4em]">
          {author && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-block w-[62px] shrink-0 text-[9px] font-normal uppercase tracking-wider not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                Author
              </span>
              <JusticeChip justice={author} />
            </div>
          )}
          {joiners.length > 0 && (
            <div className="flex items-start gap-x-2">
              <span className="inline-block w-[62px] shrink-0 pt-[2px] text-[9px] font-normal uppercase tracking-wider not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                Joined by
              </span>
              <div
                className="grid grid-cols-2 gap-x-4 gap-y-1"
                style={{
                  gridTemplateRows: `repeat(${Math.ceil(joiners.length / 2)}, auto)`,
                  gridAutoFlow: "column",
                }}
              >
                {joiners.map((j) => (
                  <JusticeChip key={j.key} justice={j} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Opinions section, "Longest"/"Shortest" menu items, panel 2: the term's
// average opinion length, the single overall extreme opinion filed this
// term, the extreme majority opinion, and the extreme concurrence -- same
// layout for both, just fed each one's own extreme (longest or shortest)
// detail set.
function OpinionExtremeOverviewPanel({ title, averageWordCount, overall, majority, concurrence, onSelectCase }: { title: "Longest" | "Shortest"; averageWordCount: number | null; overall: OpinionLengthDetail | null; majority: OpinionLengthDetail | null; concurrence: OpinionLengthDetail | null; onSelectCase: (slug: string) => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-[1em] overflow-hidden px-6 pb-2 pt-[14px]">
      <div>
        <p className="mb-[0.75em] text-left font-serif text-[14px] font-normal text-[#6B6560]">Average Opinion Length</p>
        <p className="mb-[1.25em] ml-[5px] text-center text-[16px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {averageWordCount != null ? `${averageWordCount.toLocaleString()} words` : "—"}
        </p>
        <p className="mb-[0.5em] text-left font-serif text-[14px] font-normal text-[#6B6560]">
          {title} Opinion{overall ? ` (${opinionKindLabel(overall.kind)})` : ""}
        </p>
        <OpinionLengthCard detail={overall} onSelectCase={onSelectCase} />
      </div>
      <div>
        <p className="mb-[0.5em] text-left font-serif text-[14px] font-normal text-[#6B6560]">{title} Majority Opinion</p>
        <OpinionLengthCard detail={majority} onSelectCase={onSelectCase} />
      </div>
      <div>
        <p className="mb-[0.5em] text-left font-serif text-[14px] font-normal text-[#6B6560]">{title} Concurrence</p>
        <OpinionLengthCard detail={concurrence} onSelectCase={onSelectCase} />
      </div>
    </div>
  );
}

// Opinions section, "Longest"/"Shortest" menu items, panel 3: one bar per
// justice, their own single longest (or shortest) opinion this term -- same
// single-hue thin-bar-with-tooltip mark as JusticeDualBarRow/JusticeOpinionRow
// above, just keyed to word count instead of minutes/turns or opinion-kind mix.
function JusticeOpinionExtremeRow({ justice, wordCount, maxWordCount, caseSlug, caseCaption, kind, onSelectCase }: { justice: (typeof ALL_JUSTICES)[number]; wordCount: number; maxWordCount: number; caseSlug: string; caseCaption: string; kind: string; onSelectCase: (slug: string) => void }) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="mb-[0.8em]">
      <div className="flex items-center gap-2" onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)}>
        {hover && (
          <span
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
            style={{
              left: hover.x,
              top: hover.y - 10,
              fontFamily: "'Lora', Georgia, serif",
            }}
          >
            {justice.displayName}
          </span>
        )}
        <Image src={justice.photo} alt={justice.displayName} width={20} height={20} className="shrink-0 rounded-full object-cover object-top" style={{ width: 20, height: 20 }} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(wordCount / maxWordCount) * 100}%`,
                backgroundColor: opinionKindColor(kind),
              }}
            />
          </div>
          <p className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {wordCount.toLocaleString()} words
          </p>
        </div>
      </div>
      <CaseTitleLink slug={caseSlug} title={`${caseCaption} (${opinionKindLabel(kind)})`} onSelectCase={onSelectCase} className="text-[10px] font-normal not-italic text-[#6B6560]" lineHeight={1.4} />
    </div>
  );
}

function OpinionExtremeByJusticePanel({ title, data, onSelectCase }: { title: "Longest" | "Shortest"; data: JusticeOpinionExtreme[]; onSelectCase: (slug: string) => void }) {
  const rows = data
    .map((entry) => {
      const justice = resolveJustice(entry.justiceSlug);
      return justice ? { justice, ...entry } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const maxWordCount = Math.max(1, ...rows.map((r) => r.wordCount));

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">{title} Opinion by Justice</p>
      <div className="min-h-0 flex-1 overflow-hidden">
        {rows.map((r) => (
          <JusticeOpinionExtremeRow key={r.justice.key} justice={r.justice} wordCount={r.wordCount} caseSlug={r.caseSlug} caseCaption={r.caseCaption} kind={r.kind} onSelectCase={onSelectCase} maxWordCount={maxWordCount} />
        ))}
      </div>
      <div className="mt-[0.4em] flex items-center justify-center gap-3">
        <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#2C4A3E" }} />
          Majority
        </span>
        <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#C4A882" }} />
          Concurrence
        </span>
        <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#C43030" }} />
          Dissent
        </span>
      </div>
    </div>
  );
}

// Opinions section, "Volume" menu item, panel 3: opinions authored per
// justice, stacked by kind and sorted highest-to-lowest total -- modeled on
// Feldman's Stat Pack "Opinions Authored by Each Justice" chart (p.16: a
// sorted, stacked horizontal bar with counts labeled inside each segment).
// Uses this app's existing majority/forest, concurring/gold, dissenting/
// rust convention (JusticesOpinionsPanel above) rather than Feldman's own
// palette, which uses colors (purple, yellow) outside this app's brand
// palette (see CLAUDE.md). Reads the same justices prop already used by the
// Oral Arguments tab -- no new data layer needed.
function VolumeOpinionSegment({ count, pct, color }: { count: number; pct: number; color: string }) {
  if (count === 0) return null;
  return (
    <div className="flex h-full items-center justify-center" style={{ width: `${pct}%`, backgroundColor: color }}>
      <span className="text-[9px] font-normal not-italic text-white" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        {count}
      </span>
    </div>
  );
}

function VolumeByJusticeRow({ justice, maxTotal }: { justice: JusticeStat; maxTotal: number }) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const total = justice.majorityOpinions + justice.concurrences + justice.dissents;
  const barPct = (total / maxTotal) * 100;
  const majPct = total > 0 ? (justice.majorityOpinions / total) * 100 : 0;
  const concPct = total > 0 ? (justice.concurrences / total) * 100 : 0;
  const disPct = total > 0 ? (justice.dissents / total) * 100 : 0;

  return (
    <div className="mb-[0.35em] flex items-center gap-2" onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)}>
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{
            left: hover.x,
            top: hover.y - 10,
            fontFamily: "'Lora', Georgia, serif",
          }}
        >
          {justice.displayName}
        </span>
      )}
      <Image src={justice.photo} alt={justice.displayName} width={20} height={20} className="shrink-0 rounded-full object-cover object-top" style={{ width: 20, height: 20 }} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-[14px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
          <div className="flex h-full" style={{ width: `${barPct}%` }}>
            <VolumeOpinionSegment count={justice.majorityOpinions} pct={majPct} color="#2C4A3E" />
            <VolumeOpinionSegment count={justice.concurrences} pct={concPct} color="#8B6914" />
            <VolumeOpinionSegment count={justice.dissents} pct={disPct} color="#C43030" />
          </div>
        </div>
        <p className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {total}
        </p>
      </div>
    </div>
  );
}

// Single-color variant of VolumeByJusticeRow, for the Majority/Concurrences/
// Dissents metric views (a single series needs no legend -- the toggle
// button already names it -- per the dataviz skill's series-count rule).
function VolumeSingleMetricRow({ justice, value, maxValue, color }: { justice: JusticeStat; value: number; maxValue: number; color: string }) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="mb-[0.35em] flex items-center gap-2" onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)}>
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{
            left: hover.x,
            top: hover.y - 10,
            fontFamily: "'Lora', Georgia, serif",
          }}
        >
          {justice.displayName}
        </span>
      )}
      <Image src={justice.photo} alt={justice.displayName} width={20} height={20} className="shrink-0 rounded-full object-cover object-top" style={{ width: 20, height: 20 }} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-[14px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(value / maxValue) * 100}%`,
              backgroundColor: color,
            }}
          />
        </div>
        <p className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

const VOLUME_METRICS = ["Total", "Majority", "Concurrences", "Dissents"] as const;
type VolumeMetric = (typeof VOLUME_METRICS)[number];
const VOLUME_METRIC_COLOR: Record<Exclude<VolumeMetric, "Total">, string> = {
  Majority: "#2C4A3E",
  Concurrences: "#8B6914",
  Dissents: "#C43030",
};

function volumeMetricValue(justice: JusticeStat, metric: VolumeMetric): number {
  if (metric === "Majority") return justice.majorityOpinions;
  if (metric === "Concurrences") return justice.concurrences;
  if (metric === "Dissents") return justice.dissents;
  return justice.majorityOpinions + justice.concurrences + justice.dissents;
}

// The Volume bar chart's highlight section (below the chart) follows
// whichever metric toggle is selected -- same title/case-list treatment,
// just pointed at a different "Most X" stat and case-category bucket.
const VOLUME_HIGHLIGHT_TITLE: Record<VolumeMetric, string> = {
  Total: "Most Opinions",
  Majority: "Most Majority Opinions",
  Concurrences: "Most Concurrences",
  Dissents: "Most Dissents",
};
const VOLUME_HIGHLIGHT_CATEGORY: Record<VolumeMetric, keyof CasesByCategoryAndJustice> = {
  Total: "total",
  Majority: "majority",
  Concurrences: "concurrence",
  Dissents: "dissent",
};
// Caps a justice's case list so the highlight section never grows tall
// enough to push the bar chart above it out of view. Total and
// Concurrences tend to run longer captions that wrap to a second line more
// often (e.g. "First Choice Women's Resource Centers v. Platkin"), so they
// need a lower cap than Majority/Dissents to stay clear of the chart.
const VOLUME_HIGHLIGHT_CASE_LIMIT: Record<VolumeMetric, number> = {
  Total: 4,
  Majority: 7,
  Concurrences: 4,
  Dissents: 7,
};

// Keeps the alphabetically-first `limit` cases (by full caption, which
// starts with the same first word the cap is defined against).
function topCasesAlphabetical(cases: JusticeCaseRef[], limit: number): JusticeCaseRef[] {
  return [...cases].sort((a, b) => a.caseCaption.localeCompare(b.caseCaption)).slice(0, limit);
}

// Display-only shortening for the majority-opinion case list in this one
// panel (Volume > All, panel 3) -- doesn't touch the underlying caption
// used anywhere else (docket lists, case detail, etc.).
function abbreviateVolumeCaseCaption(caption: string): string {
  return caption.replace("Louisiana Department of Corrections and Public Safety", "Louisiana DCPS").replace("Securities and Exchange Commission", "SEC");
}

function VolumeByJusticePanel({ justices, highlights, onSelectCase }: { justices: JusticeStat[]; highlights: OpinionJoinerHighlights; onSelectCase: (slug: string) => void }) {
  const [metric, setMetric] = useState<VolumeMetric>("Total");
  const sorted = [...justices].sort((a, b) => volumeMetricValue(b, metric) - volumeMetricValue(a, metric));
  const maxValue = Math.max(1, ...sorted.map((j) => volumeMetricValue(j, metric)));

  // The highlight section below the chart follows the selected metric.
  const highlightJustice = topByCount(justices, (j) => volumeMetricValue(j, metric));
  const highlightValue = highlightJustice ? volumeMetricValue(highlightJustice, metric) : null;
  const highlightSlug = highlightJustice ? PERSON_SLUG_BY_JUSTICE_KEY[highlightJustice.key] : undefined;
  const highlightCasesRaw = highlightSlug ? (highlights.casesByJusticeAndCategory[VOLUME_HIGHLIGHT_CATEGORY[metric]][highlightSlug] ?? []) : [];
  const highlightCases = topCasesAlphabetical(highlightCasesRaw, VOLUME_HIGHLIGHT_CASE_LIMIT[metric]);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.5em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Opinions Authored by Justice</p>
      <div className="mb-[0.5em] flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {VOLUME_METRICS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className="text-[10px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontWeight: metric === m ? 700 : 400,
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="min-h-0 overflow-hidden [&>div:last-child]:mb-0">{metric === "Total" ? sorted.map((j) => <VolumeByJusticeRow key={j.key} justice={j} maxTotal={maxValue} />) : sorted.map((j) => <VolumeSingleMetricRow key={j.key} justice={j} value={volumeMetricValue(j, metric)} maxValue={maxValue} color={VOLUME_METRIC_COLOR[metric]} />)}</div>
      {metric === "Total" && (
        <div className="mt-[10px] flex items-center justify-center gap-3">
          <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#2C4A3E" }} />
            Majority
          </span>
          <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#8B6914" }} />
            Concurring
          </span>
          <span className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#C43030" }} />
            Dissenting
          </span>
        </div>
      )}
      <div className="mt-[0.6em]">
        <HighlightStat title={VOLUME_HIGHLIGHT_TITLE[metric]} justice={highlightJustice} value={highlightValue} unit="opinions" center valueInTitle />
      </div>
      {highlightCases.length > 0 && (
        <div
          className="mt-[0.6em] grid grid-cols-2 items-start gap-x-4 gap-y-[0.4em]"
          style={{
            gridTemplateRows: `repeat(${Math.ceil(highlightCases.length / 2)}, auto)`,
            gridAutoFlow: "column",
          }}
        >
          {highlightCases.map((c) => (
            <CaseTitleLink key={c.caseSlug} slug={c.caseSlug} title={abbreviateVolumeCaseCaption(c.caseCaption)} onSelectCase={onSelectCase} className="text-[11px] font-normal not-italic text-[#1A1A1A]" lineHeight={1.4} />
          ))}
        </div>
      )}
    </div>
  );
}

// Opinions section, "Alignment" menu item, panel 2: pairwise agreement rate
// between every justice, all cases -- recreates Feldman's Stat Pack
// "Justice Agreement – All Cases" grid (PDF p.11), a lower-triangular
// matrix. Feldman's row order (top to bottom) is ALL_JUSTICES[0..7]
// reversed (Barrett...Roberts); his column order (left to right) is
// ALL_JUSTICES[1..8] (Thomas...Jackson); a cell is shown only when the
// column justice sits later than the row justice in that same seniority
// list -- each pair appears exactly once. Heatmap + single-hue sequential
// color by magnitude is the dataviz skill's own recommended form for a
// grid of magnitudes (unlike a pie, which fails this app's colorblind-
// safety check past 3 categories) -- rust in place of Feldman's blue,
// since blue/purple are outside this app's brand palette (CLAUDE.md).
const AGREEMENT_ROW_ORDER = ALL_JUSTICES.slice(0, 8).reverse();
const AGREEMENT_COL_ORDER = ALL_JUSTICES.slice(1);
// Data columns are fluid (1fr) so the grid fills the panel's full content
// width -- its right edge then sits the same px-6 buffer from the panel
// edge as the left edge already does, instead of stopping short at a fixed
// pixel width. Cells stay square via aspect-ratio as that width changes.
// Portrait size and label column scale up to match the larger cells.
const AGREEMENT_PORTRAIT_SIZE = 26;

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bch = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bch})`;
}

// Least aligned -> rust, most aligned -> forest, tan at the midpoint --
// two equal-step arms off a shared middle, same shape as the dataviz
// skill's diverging ramp (two hues + a neutral midpoint), using this app's
// own brand colors in place of a plain gray.
function agreementCellColor(pct: number, minPct: number, maxPct: number): string {
  const t = maxPct > minPct ? (pct - minPct) / (maxPct - minPct) : 1;
  const clamped = Math.max(0, Math.min(1, t));
  return clamped <= 0.5 ? mixHex("#C43030", "#C4A882", clamped / 0.5) : mixHex("#C4A882", "#2C4A3E", (clamped - 0.5) / 0.5);
}

// Below-the-grid "Most Aligned" / "Least Aligned" column: the single pair
// at that extreme, both portraits + names, and the shared percentage.
function AlignmentExtremeColumn({ title, justices, pct }: { title: string; justices: [(typeof ALL_JUSTICES)[number], (typeof ALL_JUSTICES)[number]] | null; pct: number | null }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="mb-[0.5em] font-serif text-[14px] font-normal text-[#6B6560]">{title}</p>
      {justices && pct != null ? (
        <>
          <div className="flex flex-col items-center gap-[0.4em]">
            <JusticeChip justice={justices[0]} />
            <JusticeChip justice={justices[1]} />
          </div>
          <p className="mt-[0.4em] text-[13px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {Math.round(pct)}% agreement
          </p>
        </>
      ) : (
        <p className="text-[12px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          No data.
        </p>
      )}
    </div>
  );
}

export function JusticeAgreementPanel({ pairs }: { pairs: JusticeAgreementPair[] }) {
  const pctByPair = new Map<string, number>();
  for (const p of pairs) {
    const j1 = resolveJustice(p.justiceSlug1);
    const j2 = resolveJustice(p.justiceSlug2);
    if (!j1 || !j2) continue;
    pctByPair.set([j1.key, j2.key].sort().join("|"), p.agreementPct);
  }
  const values = pairs.map((p) => p.agreementPct);
  const minPct = values.length > 0 ? Math.min(...values) : 0;
  const maxPct = values.length > 0 ? Math.max(...values) : 100;
  const seniority = (key: string) => ALL_JUSTICES.findIndex((j) => j.key === key);

  const mostAlignedPair = pairs.reduce<JusticeAgreementPair | null>((best, p) => (!best || p.agreementPct > best.agreementPct ? p : best), null);
  const leastAlignedPair = pairs.reduce<JusticeAgreementPair | null>((best, p) => (!best || p.agreementPct < best.agreementPct ? p : best), null);
  function pairJustices(pair: JusticeAgreementPair | null): [(typeof ALL_JUSTICES)[number], (typeof ALL_JUSTICES)[number]] | null {
    if (!pair) return null;
    const j1 = resolveJustice(pair.justiceSlug1);
    const j2 = resolveJustice(pair.justiceSlug2);
    return j1 && j2 ? [j1, j2] : null;
  }
  const mostAlignedJustices = pairJustices(mostAlignedPair);
  const leastAlignedJustices = pairJustices(leastAlignedPair);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    name: string;
  } | null>(null);
  const portraitHoverHandlers = (name: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY, name }),
    onMouseMove: (e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY, name }),
    onMouseLeave: () => setHover(null),
  });

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Alignment (Votes)</p>
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{
            left: hover.x,
            top: hover.y - 10,
            fontFamily: "'Lora', Georgia, serif",
          }}
        >
          {hover.name}
        </span>
      )}
      <div className="min-h-0 w-full flex-1 overflow-auto">
        <div
          className="grid w-full gap-[5px]"
          style={{
            gridTemplateColumns: `${AGREEMENT_PORTRAIT_SIZE}px repeat(${AGREEMENT_COL_ORDER.length}, 1fr)`,
          }}
        >
          {AGREEMENT_ROW_ORDER.map((rowJustice) => {
            const rowRank = seniority(rowJustice.key);
            return (
              <Fragment key={rowJustice.key}>
                <div className="flex items-center justify-center">
                  <Image
                    src={rowJustice.photo}
                    alt={rowJustice.displayName}
                    width={AGREEMENT_PORTRAIT_SIZE}
                    height={AGREEMENT_PORTRAIT_SIZE}
                    className="rounded-full object-cover object-top"
                    style={{
                      width: AGREEMENT_PORTRAIT_SIZE,
                      height: AGREEMENT_PORTRAIT_SIZE,
                    }}
                    {...portraitHoverHandlers(rowJustice.displayName)}
                  />
                </div>
                {AGREEMENT_COL_ORDER.map((colJustice) => {
                  const colRank = seniority(colJustice.key);
                  if (colRank <= rowRank) {
                    return <div key={colJustice.key} />;
                  }
                  const pct = pctByPair.get([rowJustice.key, colJustice.key].sort().join("|"));
                  return (
                    <div
                      key={colJustice.key}
                      className="flex items-center justify-center rounded-sm"
                      style={{
                        aspectRatio: "1 / 1",
                        backgroundColor: pct != null ? agreementCellColor(pct, minPct, maxPct) : "#F5F0E8",
                      }}
                      title={`${rowJustice.displayName} & ${colJustice.displayName}`}
                    >
                      {pct != null && (
                        <span className="rounded bg-[#FAFAF7] px-[4px] py-[2px] text-[8px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'DM Mono', monospace" }}>
                          {Math.round(pct)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
          <Fragment key="axis">
            <div />
            {AGREEMENT_COL_ORDER.map((colJustice) => (
              <div key={colJustice.key} className="flex items-center justify-center pt-[2px]">
                <Image
                  src={colJustice.photo}
                  alt={colJustice.displayName}
                  width={AGREEMENT_PORTRAIT_SIZE}
                  height={AGREEMENT_PORTRAIT_SIZE}
                  className="rounded-full object-cover object-top"
                  style={{
                    width: AGREEMENT_PORTRAIT_SIZE,
                    height: AGREEMENT_PORTRAIT_SIZE,
                  }}
                  {...portraitHoverHandlers(colJustice.displayName)}
                />
              </div>
            ))}
          </Fragment>
        </div>
      </div>
      <div className="mt-[0.3em] grid grid-cols-2 gap-x-4">
        <AlignmentExtremeColumn title="Most Aligned" justices={mostAlignedJustices} pct={mostAlignedPair?.agreementPct ?? null} />
        <AlignmentExtremeColumn title="Least Aligned" justices={leastAlignedJustices} pct={leastAlignedPair?.agreementPct ?? null} />
      </div>
    </div>
  );
}

// Opinions section, "Alignment" > "Joiners" menu item, panel 2: for every
// pair of justices, what share of the row justice's concurrences the
// column justice joined this term (joins / that author's total
// concurrences authored, from the same justices prop the Volume charts
// use). Unlike the agreement grid this isn't symmetric (author x joiner),
// so it's a full 9x9 grid rather than a triangular one -- every justice on
// both axes, self-pairs (the diagonal) left blank since a justice can't
// join their own opinion. Sequential single-hue color (ivory -> forest)
// rather than the agreement grid's diverging rust/tan/forest, since a join
// share has no "good/bad" polarity the way an agreement percentage
// arguably does.
function joinShareColor(pct: number): string {
  return mixHex("#FAFAF7", "#2C4A3E", Math.max(0, Math.min(1, pct / 100)));
}

// Same sequential single-hue treatment as joinShareColor, but rust instead
// of forest, so the Dissent toggle reads visually distinct from Concurrences.
function dissentJoinShareColor(pct: number): string {
  return mixHex("#FAFAF7", "#C43030", Math.max(0, Math.min(1, pct / 100)));
}

const JOIN_PANEL_VIEWS = ["Concurrences", "Dissent"] as const;
type JoinPanelView = (typeof JOIN_PANEL_VIEWS)[number];

const JOIN_PANEL_MODES = ["Absolute", "Percentage"] as const;
type JoinPanelMode = (typeof JOIN_PANEL_MODES)[number];

function ConcurrenceJoinPanel({
  concurrenceData,
  dissentData,
}: {
  concurrenceData: JusticeJoinData;
  dissentData: JusticeJoinData;
}) {
  const [view, setView] = useState<JoinPanelView>("Concurrences");
  const [mode, setMode] = useState<JoinPanelMode>("Percentage");
  const activeData = view === "Concurrences" ? concurrenceData : dissentData;
  const countByPair = new Map<string, number>();
  for (const p of activeData.pairs) {
    const author = resolveJustice(p.authorSlug);
    const joiner = resolveJustice(p.joinerSlug);
    if (!author || !joiner) continue;
    countByPair.set(`${author.key}|${joiner.key}`, p.count);
  }
  // Live-computed from the same opinion rows as the join counts above
  // (see getOpinionJoinData), not justice_stats.concurrences/dissents --
  // that table can drift out of sync with the opinions table and produce
  // a >100% join share.
  const authoredByKey = new Map(
    Object.entries(activeData.authoredCountBySlug)
      .map(([slug, count]) => [resolveJustice(slug)?.key, count] as const)
      .filter((entry): entry is [string, number] => !!entry[0]),
  );
  const cellColor = view === "Concurrences" ? joinShareColor : dissentJoinShareColor;
  const opinionNoun = view === "Concurrences" ? "concurrences" : "dissents";
  // Absolute mode reuses the same sequential color scale, normalized against
  // the highest join count in the current view instead of a 0-100% share.
  const maxCount = Math.max(1, ...activeData.pairs.map((p) => p.count));
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    name: string;
  } | null>(null);
  const portraitHoverHandlers = (name: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY, name }),
    onMouseMove: (e: React.MouseEvent) => setHover({ x: e.clientX, y: e.clientY, name }),
    onMouseLeave: () => setHover(null),
  });

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.5em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Joiners</p>
      <div className="mb-[0.4em] flex items-center justify-center gap-x-3">
        {JOIN_PANEL_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`text-[10px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030] ${view === v ? "underline" : ""}`}
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontWeight: view === v ? 700 : 400,
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mb-[10px] flex items-center justify-center gap-x-3">
        {JOIN_PANEL_MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`text-[10px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030] ${mode === m ? "underline" : ""}`}
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontWeight: mode === m ? 700 : 400,
            }}
          >
            {m}
          </button>
        ))}
      </div>
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{
            left: hover.x,
            top: hover.y - 10,
            fontFamily: "'Lora', Georgia, serif",
          }}
        >
          {hover.name}
        </span>
      )}
      <div className="-ml-[5px]">
      <div className="flex min-h-0">
        {/* No flex-1: this row shrink-wraps to the grid's fixed, deliberately
            small row height (below) rather than stretching to fill the
            panel, so the heatmap stays compact like the votes heatmap and
            simply fits -- it doesn't scale up to consume extra panel space.
            The centered "Author" label lands on the grid's true midpoint --
            Kagan's row -- because the grid's rendered height is exactly its
            content height. */}
          <div className="flex w-[16px] shrink-0 items-center justify-center">
            <p
              className="whitespace-nowrap text-[10px] font-normal uppercase tracking-wider not-italic text-[#6B6560]"
              style={{
                fontFamily: "'Lora', Georgia, serif",
                transform: "rotate(-90deg)",
              }}
            >
              Author
            </p>
          </div>
          <div className="min-h-0 w-full flex-1 overflow-hidden">
            <div
              className="grid w-full gap-[5px]"
              style={{
                gridTemplateColumns: `${AGREEMENT_PORTRAIT_SIZE}px repeat(${ALL_JUSTICES.length}, 1fr)`,
                gridAutoRows: `${AGREEMENT_PORTRAIT_SIZE}px`,
              }}
            >
              {ALL_JUSTICES.map((rowJustice) => {
                const authored = authoredByKey.get(rowJustice.key) ?? 0;
                return (
                  <Fragment key={rowJustice.key}>
                    <div className="flex items-center justify-center">
                      <Image
                        src={rowJustice.photo}
                        alt={rowJustice.displayName}
                        width={AGREEMENT_PORTRAIT_SIZE}
                        height={AGREEMENT_PORTRAIT_SIZE}
                        className="rounded-full object-cover object-top"
                        style={{
                          width: AGREEMENT_PORTRAIT_SIZE,
                          height: AGREEMENT_PORTRAIT_SIZE,
                        }}
                        {...portraitHoverHandlers(rowJustice.displayName)}
                      />
                    </div>
                    {ALL_JUSTICES.map((colJustice) => {
                      if (colJustice.key === rowJustice.key) {
                        return <div key={colJustice.key} />;
                      }
                      const count = countByPair.get(`${rowJustice.key}|${colJustice.key}`) ?? 0;
                      const pct = authored > 0 ? (count / authored) * 100 : 0;
                      const colorPct = mode === "Percentage" ? pct : (count / maxCount) * 100;
                      const cellText = mode === "Percentage" ? `${Math.round(pct)}%` : `${count}`;
                      const title =
                        mode === "Percentage"
                          ? `${colJustice.displayName} joined ${Math.round(pct)}% of ${rowJustice.displayName}'s ${opinionNoun} (${count} of ${authored})`
                          : `${colJustice.displayName} joined ${count} of ${rowJustice.displayName}'s ${authored} ${opinionNoun}`;
                      return (
                        <div key={colJustice.key} className="flex items-center justify-center rounded-sm" style={{ backgroundColor: cellColor(colorPct) }} title={title}>
                          {count > 0 && (
                            <span className="rounded bg-[#FAFAF7] px-[4px] py-[2px] text-[9px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'DM Mono', monospace" }}>
                              {cellText}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
        {/* Its own row, outside the Author label's height-reference sibling
          above, offset by the same 16px so its columns still line up under
          the data grid's. */}
        <div className="ml-[16px] shrink-0">
          <div
            className="mt-[5px] grid w-full gap-[5px]"
            style={{
              gridTemplateColumns: `${AGREEMENT_PORTRAIT_SIZE}px repeat(${ALL_JUSTICES.length}, 1fr)`,
            }}
          >
            <div />
            {ALL_JUSTICES.map((colJustice) => (
              <div key={colJustice.key} className="flex items-center justify-center pt-[2px]">
                <Image
                  src={colJustice.photo}
                  alt={colJustice.displayName}
                  width={AGREEMENT_PORTRAIT_SIZE}
                  height={AGREEMENT_PORTRAIT_SIZE}
                  className="rounded-full object-cover object-top"
                  style={{
                    width: AGREEMENT_PORTRAIT_SIZE,
                    height: AGREEMENT_PORTRAIT_SIZE,
                  }}
                  {...portraitHoverHandlers(colJustice.displayName)}
                />
              </div>
            ))}
          </div>
        </div>
      <p className="mt-[0.3em] text-center text-[10px] font-normal uppercase tracking-wider not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        Joiner
      </p>
      </div>
    </div>
  );
}

// Opinions section, "Justices" menu item, panel 2: total word count across
// every opinion (any kind) the selected justice authored this term. Being
// built out for Chief Justice Roberts first as the template for the other
// eight justices.
// A justice's longest or shortest opinion this term: heading, then each
// value (word count, case, type, joiners) on its own indented line.
// Reuses the Length section's own OpinionLengthCard for the Longest/Shortest
// blocks below, so this panel matches that panel's fonts and layout exactly
// rather than a bespoke restyling of the same data. JusticeOpinionExtreme
// doesn't carry authorSlug (it's implicitly this justice), so it's filled
// in here to match OpinionLengthDetail's shape.
function toOpinionLengthDetail(extreme: JusticeOpinionExtreme | null, justiceSlug: string): OpinionLengthDetail | null {
  if (!extreme) return null;
  return {
    opinionId: extreme.opinionId,
    caseSlug: extreme.caseSlug,
    caseCaption: extreme.caseCaption,
    wordCount: extreme.wordCount,
    kind: extreme.kind,
    authorSlug: justiceSlug,
    joinerSlugs: extreme.joinerSlugs,
  };
}

export function JusticeTotalWordsPanel({ totalWords, longest, shortest, justiceSlug, justice, maxTotal, onSelectCase }: { totalWords: number; longest: JusticeOpinionExtreme | null; shortest: JusticeOpinionExtreme | null; justiceSlug: string; justice: JusticeStat | null; maxTotal: number; onSelectCase: (slug: string) => void }) {
  const selfJustice = resolveJustice(justiceSlug) ?? null;
  const longestDetail = toOpinionLengthDetail(longest, justiceSlug);
  const shortestDetail = toOpinionLengthDetail(shortest, justiceSlug);

  return (
    <div className="flex h-full min-w-0 flex-col gap-[1em] overflow-hidden px-6 pb-2 pt-[14px]">
      {selfJustice && (
        <div className="flex items-center justify-center gap-[0.5em]">
          <Image src={selfJustice.photo} alt={selfJustice.displayName} width={32} height={32} className="rounded-full object-cover object-top" style={{ width: 32, height: 32 }} />
          <p className="text-center font-serif text-[20px] font-normal not-italic text-[#1A1A1A]">{selfJustice.displayName}</p>
        </div>
      )}
      <div>
        <p className="mb-[0.5em] text-left font-serif text-[14px] font-normal text-[#6B6560]">Total Words Written</p>
        <p className="ml-[5px] text-[13px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.4 }}>
          {totalWords.toLocaleString()} words
        </p>
      </div>
      <div className="-mt-[5px]">
        <p className="mb-[0.5em] text-left font-serif text-[14px] font-normal text-[#6B6560]">
          Longest Opinion{longestDetail ? ` (${opinionKindLabel(longestDetail.kind)})` : ""}
        </p>
        <OpinionLengthCard detail={longestDetail} onSelectCase={onSelectCase} />
      </div>
      <div>
        <p className="mb-[0.5em] text-left font-serif text-[14px] font-normal text-[#6B6560]">
          Shortest Opinion{shortestDetail ? ` (${opinionKindLabel(shortestDetail.kind)})` : ""}
        </p>
        <OpinionLengthCard detail={shortestDetail} onSelectCase={onSelectCase} />
      </div>
      {justice && (
        <div>
          <p className="mb-[0.5em] text-left font-serif text-[14px] font-normal text-[#6B6560]">Opinions Written</p>
          <VolumeByJusticeRow justice={justice} maxTotal={maxTotal} />
        </div>
      )}
    </div>
  );
}

// Original size 220px/48px, scaled to 2/3 (147px/32px), then back up 1/4 (184px/40px).
const MAJORITY_MINORITY_BAR_CHART_HEIGHT = 184;

// Opinions section, "Justices" menu item, panel 3: a two-bar vertical chart
// -- % of this term's cases the justice sided with the majority vs. the
// minority (dissenting side). Same majority=forest/dissent=rust color
// convention as VolumeByJusticeRow's opinion-type segments. Fixed chart
// height (not stretched to fill the panel), matching the Joiners heatmap's
// "stays compact, doesn't scale up" precedent.
// Like AlignmentExtremeColumn (JusticeAgreementPanel), but this panel is
// already about one fixed justice, so only the OTHER justice in the pair
// needs a portrait -- not both.
// A justice's portrait with their name centered below it (as opposed to
// JusticeChip's side-by-side portrait+name).
function JusticePortraitStack({ justice }: { justice: (typeof ALL_JUSTICES)[number] }) {
  return (
    <div className="flex w-[64px] flex-col items-center gap-[0.3em]">
      <Image src={justice.photo} alt={justice.displayName} width={28} height={28} className="rounded-full object-cover object-top" style={{ width: 28, height: 28 }} />
      <p className="text-center text-[9px] font-normal not-italic leading-tight text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        {justice.displayName}
      </p>
    </div>
  );
}

// Title, then [self portrait] arrow n% arrow [other portrait] -- arrows
// point inward (toward n%) for "Votes with Most", outward (away from n%,
// toward each justice) for "Votes Different Than Most".
function VotesComparisonRow({ title, pct, self, other, arrowsPointInward }: { title: string; pct: number | null; self: (typeof ALL_JUSTICES)[number] | null; other: (typeof ALL_JUSTICES)[number] | null; arrowsPointInward: boolean }) {
  const leftArrow = arrowsPointInward ? "→" : "←";
  const rightArrow = arrowsPointInward ? "←" : "→";
  return (
    <div className="flex flex-col items-center text-center">
      <p className="mb-[0.5em] font-serif text-[14px] font-normal text-[#6B6560]">{title}</p>
      {self && other && pct != null ? (
        <div className="flex items-center justify-center gap-x-[6px]">
          <JusticePortraitStack justice={self} />
          <span className="text-[14px] not-italic text-[#6B6560]">{leftArrow}</span>
          <span className="font-serif text-[16px] font-normal not-italic text-[#1A1A1A]">{Math.round(pct)}%</span>
          <span className="text-[14px] not-italic text-[#6B6560]">{rightArrow}</span>
          <JusticePortraitStack justice={other} />
        </div>
      ) : (
        <p className="text-[12px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          No data.
        </p>
      )}
    </div>
  );
}

function MajorityMinorityBarChart({ rate, agreementPairs, justiceSlug }: { rate: JusticeMajorityMinorityRate | null; agreementPairs: JusticeAgreementPair[]; justiceSlug: string }) {
  const selfJustice = resolveJustice(justiceSlug) ?? null;
  const relevantPairs = agreementPairs.filter((p) => p.justiceSlug1 === justiceSlug || p.justiceSlug2 === justiceSlug);
  const mostAlignedPair = relevantPairs.reduce<JusticeAgreementPair | null>((best, p) => (!best || p.agreementPct > best.agreementPct ? p : best), null);
  const leastAlignedPair = relevantPairs.reduce<JusticeAgreementPair | null>((best, p) => (!best || p.agreementPct < best.agreementPct ? p : best), null);
  function otherJustice(pair: JusticeAgreementPair | null) {
    if (!pair) return null;
    const otherSlug = pair.justiceSlug1 === justiceSlug ? pair.justiceSlug2 : pair.justiceSlug1;
    return resolveJustice(otherSlug) ?? null;
  }

  if (!rate) {
    return (
      <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
        <p className="mb-[0.5em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Majority vs. Minority</p>
        <p className="text-[12px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          No data.
        </p>
      </div>
    );
  }
  const bars = [
    { label: "Majority", pct: rate.majorityPct, color: "#2C4A3E" },
    { label: "Minority", pct: rate.minorityPct, color: "#C43030" },
  ];
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.5em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Majority vs. Minority</p>
      <div className="flex items-end justify-center gap-x-[40px]" style={{ height: MAJORITY_MINORITY_BAR_CHART_HEIGHT }}>
        {bars.map((b) => (
          <div key={b.label} className="flex flex-col items-center">
            <span className="mb-[0.5em] font-serif text-[11px] font-normal not-italic text-[#1A1A1A]">
              {b.pct}%
            </span>
            <div
              className="w-[40px] rounded-t-sm"
              style={{ height: (b.pct / 100) * (MAJORITY_MINORITY_BAR_CHART_HEIGHT - 34), backgroundColor: b.color }}
            />
            <span className="mt-[0.5em] whitespace-nowrap text-[9px] font-normal uppercase tracking-wider not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              {b.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-[0.75em] text-center text-[9px] font-normal not-italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        {rate.majorityCases} of {rate.casesParticipated} cases in the majority
      </p>
      <div className="mt-[1em] flex flex-col gap-[1em]">
        <VotesComparisonRow title="Votes with Most" pct={mostAlignedPair?.agreementPct ?? null} self={selfJustice} other={otherJustice(mostAlignedPair)} arrowsPointInward={true} />
        <VotesComparisonRow title="Votes Different Than Most" pct={leastAlignedPair ? 100 - leastAlignedPair.agreementPct : null} self={selfJustice} other={otherJustice(leastAlignedPair)} arrowsPointInward={false} />
      </div>
    </div>
  );
}

// Dropdown listing all nine justices (portrait + name), plus an "All
// Justices" option to clear the filter. Closes on selection or on a click
// outside the control.
function MajorityAuthorFilter({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = value ? ALL_JUSTICES.find((j) => j.key === value) : undefined;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative w-1/2">
      <div className="inline-flex w-max max-w-none items-center gap-[6px] whitespace-nowrap">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-[6px] border-0 bg-transparent p-0 text-left transition-colors hover:text-[#C43030]"
        >
          <span className="font-serif text-[13px] font-normal not-italic text-[#6B6560]">Majority Author</span>
          <span className="text-[9px] text-[#6B6560]">{open ? "▲" : "▼"}</span>
        </button>
        {selected && (
          <Image src={selected.photo} alt={selected.displayName} width={16} height={16} className="rounded-full object-cover object-top" style={{ width: 16, height: 16 }} />
        )}
        {selected && (
          <span className="text-[13px] not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {selected.displayName}
          </span>
        )}
        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${selected.displayName}`}
            className="text-[13px] leading-none text-[#6B6560] transition-colors hover:text-[#C43030]"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-[2px] w-[300px] border border-[#C4A882] bg-[#FAFAF7] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="block w-full px-2 py-[6px] text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
            style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: value === null ? 700 : 400 }}
          >
            All Justices
          </button>
          {/* Two columns so all nine justices fit without the list running
              past the bottom of the (overflow-hidden) panel. The currently
              selected justice is dropped from the list entirely -- already
              shown on the trigger line, picking a different one replaces it. */}
          <div className="grid grid-cols-2">
            {ALL_JUSTICES.filter((j) => j.key !== value).map((j) => (
              <button
                key={j.key}
                type="button"
                onClick={() => {
                  onChange(j.key);
                  setOpen(false);
                }}
                className="flex min-w-0 items-center gap-[6px] px-2 py-[6px] text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                style={{ fontFamily: "'Lora', Georgia, serif" }}
              >
                <Image src={j.photo} alt={j.displayName} width={16} height={16} className="shrink-0 rounded-full object-cover object-top" style={{ width: 16, height: 16 }} />
                <span className="truncate">{j.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Single-select, same trigger/dropdown design as MajorityAuthorFilter, just
// text-only (no justice portrait) and a much longer options list (38 Stat
// Pack issue categories vs. 9 justices) -- a single column at this width
// runs to 38 rows, likely taller than the (overflow-hidden, unscrolled)
// filters panel can show without clipping past the bottom edge.
function IssueFilter({ options, value, onChange }: { options: { slug: string; label: string }[]; value: string | null; onChange: (slug: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = value ? options.find((o) => o.slug === value) : undefined;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative w-1/2">
      <div className="inline-flex w-max max-w-none items-center gap-[6px] whitespace-nowrap">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-[6px] border-0 bg-transparent p-0 text-left transition-colors hover:text-[#C43030]"
        >
          <span className="font-serif text-[13px] font-normal not-italic text-[#6B6560]">Issue</span>
          <span className="text-[9px] text-[#6B6560]">{open ? "▲" : "▼"}</span>
        </button>
        {selected && (
          <span className="text-[13px] not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {selected.label}
          </span>
        )}
        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${selected.label}`}
            className="text-[13px] leading-none text-[#6B6560] transition-colors hover:text-[#C43030]"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-[2px] w-[300px] border border-[#C4A882] bg-[#FAFAF7] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="block w-full px-2 py-[6px] text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
            style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: value === null ? 700 : 400 }}
          >
            All Issues
          </button>
          {/* Capped height + scroll -- 38 options in 2 columns runs to 19
              rows, taller than the filters panel (overflow-hidden, no
              scroll of its own) can show without clipping past its bottom
              edge. "All Issues" stays outside the scroll area, always
              reachable without scrolling first. */}
          <ScrollableRegion outerClassName="" innerClassName="" innerStyle={{ maxHeight: 140 }}>
            <div className="grid grid-cols-2">
              {options
                .filter((o) => o.slug !== value)
                .map((o) => (
                  <button
                    key={o.slug}
                    type="button"
                    onClick={() => {
                      onChange(o.slug);
                      setOpen(false);
                    }}
                    className="flex min-w-0 items-center px-2 py-[6px] text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                    style={{ fontFamily: "'Lora', Georgia, serif" }}
                  >
                    <span className="truncate">{o.label}</span>
                  </button>
                ))}
            </div>
          </ScrollableRegion>
        </div>
      )}
    </div>
  );
}

// Multi-select sibling of MajorityAuthorFilter -- same trigger/list design
// and click-outside-to-close behavior, but toggles instead of replacing the
// selection, and the list stays open after a click so more than one justice
// can be picked in one pass. The first selected justice's portrait/name sit
// on the trigger's own line same as MajorityAuthorFilter; any further
// selections spill onto a second line, indented to line up under that
// first portrait (measured via labelRef, not guessed).
// Generic multi-select justice filter -- trigger line shows the first
// selected justice (portrait/name/×), any further selections wrap onto a
// second line indented to align under that first portrait (measured via
// labelRef, not guessed). Dropdown is a two-column, 300px-wide list
// (fits inside the panel's overflow-hidden bounds) of `options` minus
// whichever are already selected. Backs both the top-level justice
// filters and each selected justice's own "Joined By" sub-filter, which
// only offers that one justice's actual co-panelists (`options`), not
// necessarily all nine.
function MultiSelectJusticeFilter({
  label,
  clearLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  clearLabel: string;
  options: { key: string; displayName: string; photo: string }[];
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [labelWidth, setLabelWidth] = useState(0);

  const selectedJustices = options.filter((j) => value.includes(j.key));
  const [firstSelected, ...restSelected] = selectedJustices;

  useLayoutEffect(() => {
    if (labelRef.current) setLabelWidth(labelRef.current.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  }

  return (
    <div ref={ref} className="relative w-1/2">
      <div className="inline-flex w-max max-w-none items-center gap-[6px] whitespace-nowrap">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-[6px] border-0 bg-transparent p-0 text-left transition-colors hover:text-[#C43030]"
        >
          <span ref={labelRef} className="inline-flex items-center gap-[6px]">
            <span className="font-serif text-[13px] font-normal not-italic text-[#6B6560]">{label}</span>
            <span className="text-[9px] text-[#6B6560]">{open ? "▲" : "▼"}</span>
          </span>
        </button>
        {firstSelected && (
          <Image src={firstSelected.photo} alt={firstSelected.displayName} width={16} height={16} className="rounded-full object-cover object-top" style={{ width: 16, height: 16 }} />
        )}
        {firstSelected && (
          <span className="text-[13px] not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {firstSelected.displayName}
          </span>
        )}
        {firstSelected && (
          <button
            type="button"
            onClick={() => toggle(firstSelected.key)}
            aria-label={`Remove ${firstSelected.displayName}`}
            className="text-[13px] leading-none text-[#6B6560] transition-colors hover:text-[#C43030]"
          >
            ×
          </button>
        )}
      </div>
      {restSelected.length > 0 && (
        <div className="mt-[0.3em] flex flex-wrap items-center gap-x-[14px] gap-y-[0.3em]" style={{ paddingLeft: labelWidth + 6 }}>
          {restSelected.map((j) => (
            <span key={j.key} className="inline-flex items-center gap-[6px] whitespace-nowrap">
              <Image src={j.photo} alt={j.displayName} width={16} height={16} className="rounded-full object-cover object-top" style={{ width: 16, height: 16 }} />
              <span className="text-[13px] not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                {j.displayName}
              </span>
              <button
                type="button"
                onClick={() => toggle(j.key)}
                aria-label={`Remove ${j.displayName}`}
                className="text-[13px] leading-none text-[#6B6560] transition-colors hover:text-[#C43030]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="absolute left-0 top-full z-10 mt-[2px] w-[300px] border border-[#C4A882] bg-[#FAFAF7] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => onChange([])}
            className="block w-full px-2 py-[6px] text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
            style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: value.length === 0 ? 700 : 400 }}
          >
            {clearLabel}
          </button>
          {/* Two columns so all nine justices fit without the list running
              past the bottom of the (overflow-hidden) panel. Already-selected
              justices drop out of the list -- they're shown on the trigger
              lines instead; clearLabel is the only way to bring one back. */}
          <div className="grid grid-cols-2">
            {options.filter((j) => !value.includes(j.key)).map((j) => (
              <button
                key={j.key}
                type="button"
                onClick={() => toggle(j.key)}
                className="flex min-w-0 items-center gap-[6px] px-2 py-[6px] text-left text-[13px] not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                style={{ fontFamily: "'Lora', Georgia, serif" }}
              >
                <Image src={j.photo} alt={j.displayName} width={16} height={16} className="shrink-0 rounded-full object-cover object-top" style={{ width: 16, height: 16 }} />
                <span className="truncate">{j.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Shared shape for Concurring Opinion / Dissenting: a top-level multi-
// select of justices, plus one "Joined By" sub-filter PER selected
// justice (a case can have more than one separately-written concurrence
// or dissent, each with its own author and joiners -- "Joined By" only
// makes sense scoped to one specific justice's own opinion, not the
// side as a whole). Each Joined By offers every justice but that one.
function OpinionSideFilter({
  label,
  selectedJustices,
  onSelectJustices,
  selectedJoinedBy,
  onSelectJoinedByForJustice,
}: {
  label: string;
  selectedJustices: string[];
  onSelectJustices: (keys: string[]) => void;
  selectedJoinedBy: Record<string, string[]>;
  onSelectJoinedByForJustice: (justiceKey: string, joiners: string[]) => void;
}) {
  const selected = ALL_JUSTICES.filter((j) => selectedJustices.includes(j.key));
  return (
    <div>
      <MultiSelectJusticeFilter label={label} clearLabel="All Justices" options={ALL_JUSTICES} value={selectedJustices} onChange={onSelectJustices} />
      {selected.length > 0 && (
        <div className="mt-[0.6em] flex flex-col gap-[0.6em] pl-[12px]">
          {selected.map((j) => (
            <MultiSelectJusticeFilter
              key={j.key}
              label={`Joined By — ${j.displayName}`}
              clearLabel="Any Justice"
              options={ALL_JUSTICES.filter((o) => o.key !== j.key)}
              value={selectedJoinedBy[j.key] ?? []}
              onChange={(keys) => onSelectJoinedByForJustice(j.key, keys)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Same shell as OpinionsMenuPanel (title, term line, header). "Majority
// Author"/"Majority Justices" filter by who's on which side of the
// decision; "Concurring Opinion"/"Dissenting" (each with per-justice
// "Joined By") filter by who wrote or joined which SPECIFIC opinion.
function AllCasesMenuPanel({
  selectedMajorityAuthor,
  onSelectMajorityAuthor,
  selectedMajorityJustices,
  onSelectMajorityJustices,
  selectedConcurringJustices,
  onSelectConcurringJustices,
  selectedConcurringJoinedBy,
  onSelectConcurringJoinedByForJustice,
  selectedDissentingJustices,
  onSelectDissentingJustices,
  selectedDissentingJoinedBy,
  onSelectDissentingJoinedByForJustice,
  issueCategories,
  selectedIssue,
  onSelectIssue,
  caseCount,
}: {
  selectedMajorityAuthor: string | null;
  onSelectMajorityAuthor: (key: string | null) => void;
  selectedMajorityJustices: string[];
  onSelectMajorityJustices: (keys: string[]) => void;
  selectedConcurringJustices: string[];
  onSelectConcurringJustices: (keys: string[]) => void;
  selectedConcurringJoinedBy: Record<string, string[]>;
  onSelectConcurringJoinedByForJustice: (justiceKey: string, joiners: string[]) => void;
  selectedDissentingJustices: string[];
  onSelectDissentingJustices: (keys: string[]) => void;
  selectedDissentingJoinedBy: Record<string, string[]>;
  onSelectDissentingJoinedByForJustice: (justiceKey: string, joiners: string[]) => void;
  issueCategories: { slug: string; label: string }[];
  selectedIssue: string | null;
  onSelectIssue: (slug: string | null) => void;
  caseCount: number;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-[#F2EDE3] px-6 pb-2 pt-[14px]">
      <p className="font-serif text-[20px] font-normal not-italic leading-tight text-[#1A1A1A]">All Cases</p>
      <div className="mt-[0.4em] flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-normal italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}>
          2025-6 Term
        </p>
        <p className="whitespace-nowrap text-[13px] font-normal italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}>
          Cases: {caseCount}
        </p>
      </div>
      <p className="mb-[0.5em] mt-[16px] text-left font-serif text-[14px] font-bold text-[#1A1A1A]">Filters</p>
      <MajorityAuthorFilter value={selectedMajorityAuthor} onChange={onSelectMajorityAuthor} />
      <div className="mt-[0.8em]">
        <MultiSelectJusticeFilter label="Majority Justices" clearLabel="All Justices" options={ALL_JUSTICES} value={selectedMajorityJustices} onChange={onSelectMajorityJustices} />
      </div>
      <div className="mt-[0.8em]">
        <OpinionSideFilter
          label="Concurring Opinion"
          selectedJustices={selectedConcurringJustices}
          onSelectJustices={onSelectConcurringJustices}
          selectedJoinedBy={selectedConcurringJoinedBy}
          onSelectJoinedByForJustice={onSelectConcurringJoinedByForJustice}
        />
      </div>
      <div className="mt-[0.8em]">
        <OpinionSideFilter
          label="Dissenting"
          selectedJustices={selectedDissentingJustices}
          onSelectJustices={onSelectDissentingJustices}
          selectedJoinedBy={selectedDissentingJoinedBy}
          onSelectJoinedByForJustice={onSelectDissentingJoinedByForJustice}
        />
      </div>
      <div className="mt-[0.8em]">
        <IssueFilter options={issueCategories} value={selectedIssue} onChange={onSelectIssue} />
      </div>
    </div>
  );
}

function PlaceholderPanel({ active, index }: { active: SectionKey; index: number }) {
  return (
    <div className="flex h-full min-w-0 items-center justify-center border border-dashed border-[#C4A882]">
      <span className="font-mono text-xs uppercase tracking-wider text-[#6B6560]">
        {active} — panel {index}
      </span>
    </div>
  );
}

function ArticleListPanel({ title, articles }: { title: string; articles: Article[] }) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">{title}</p>
      {articles.length === 0 ? (
        <p className="text-center text-[13px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
          No articles.
        </p>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-hidden">
            {articles.slice(0, ARTICLE_PAGE_SIZE).map((a) => (
              <div key={a.id} className="mb-[0.8em]">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[13px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    lineHeight: 1.4,
                  }}
                >
                  {a.title}
                </a>
                <p
                  className="text-[11px] font-normal not-italic text-[#6B6560]"
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    lineHeight: 1.5,
                  }}
                >
                  {a.source}
                  {a.author ? ` · ${a.author}` : ""} · {a.publishedAt}
                </p>
              </div>
            ))}
          </div>
          {articles.length > ARTICLE_PAGE_SIZE && (
            <Link href="/analysis" className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              View all {articles.length} articles →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

const SOURCES = [
  {
    label: "Supreme Court of the United States",
    href: "https://www.supremecourt.gov",
  },
  { label: "CourtListener", href: "https://www.courtlistener.com" },
  { label: "SCOTUSblog", href: "https://www.scotusblog.com" },
  { label: "The Atlantic", href: "https://www.theatlantic.com" },
  { label: "The New Yorker", href: "https://www.newyorker.com" },
  {
    label: "New York Magazine (Intelligencer)",
    href: "https://nymag.com/intelligencer/",
  },
  {
    label: "Supreme Court Oral Arguments Podcast",
    href: "https://open.spotify.com",
  },
  { label: "The Washington Post", href: "https://www.washingtonpost.com" },
  { label: "The Dispatch", href: "https://thedispatch.com" },
  { label: "Financial Times", href: "https://www.ft.com" },
  { label: "The New York Times", href: "https://www.nytimes.com" },
];

function AboutLeftPanel() {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-6 pt-[19px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Founder - Admin</p>
      <div className="mb-[1.5em] flex flex-col items-center gap-[1.5em] text-center text-[13px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
        <p>
          <a href="https://www.linkedin.com/in/williampatrickhiggins/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#C43030]">
            William Higgins
          </a>
        </p>
      </div>
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Comments, Corrections, or Suggestions?</p>
      <p className="mb-[1.5em] text-center text-[13px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
        <a href="mailto:william.higgins@sciencespo.fr" className="transition-colors hover:text-[#C43030]">
          william.higgins@sciencespo.fr
        </a>
      </p>
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Updates</p>
      <p className="mb-[1.5em] text-center text-[13px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
        The site is updated automatically each day at 5pm ET.
      </p>
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Sources</p>
      <ul
        className="grid list-none grid-cols-2 gap-x-3 gap-y-[7px] text-center text-[12px] font-normal not-italic text-[#1A1A1A]"
        style={{
          fontFamily: "'Lora', Georgia, serif",
          lineHeight: 1.3,
          gridTemplateRows: `repeat(${Math.ceil(SOURCES.length / 2)}, auto)`,
          gridAutoFlow: "column",
        }}
      >
        {SOURCES.map(({ label, href }) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#C43030]">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AboutMiddlePanel() {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-6 pt-[19px]">
      <p className="mb-[1.5em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Welcome to SCOTUS Dashboard</p>
      <div className="flex flex-col gap-[1.5em] text-[13px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
        <p>This site tracks recent and upcoming cases before the Supreme Court. It is meant to orient readers through basic analysis of the cases including their fact patterns, the legal questions at hand, the positions of the different parties to the case, and legal opinions from experts and journalists. The site is best used as a starting point to dig deeper into these cases though primary and secondary sources, all of which should be linked throughout the site.</p>
        <p>The site uses AI to compile case information directly from official Supreme Court records, including transcripts, docket filings, and published opinions. Summaries, legal terminology explanations, litigant positions, etc, are also generated using AI. They should not be treated as legal advice or authoritative legal commentary. This site is intended for public information and research purposes.</p>
      </div>
    </div>
  );
}

function DocketUpcomingPanel({ cases, today, tomorrow, onSelectCase }: { cases: CaseSummary[]; today: string; tomorrow: string; onSelectCase: (slug: string) => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Upcoming</p>
      {cases.length === 0 ? (
        <p className="text-center text-[13px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
          Case and oral argument information for the next term will be added in the coming weeks. Thank you.
        </p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-[1em] overflow-hidden">
            {cases.slice(0, DOCKET_PAGE_SIZE).map((c) => {
              const isToday = c.argumentDate === today;
              const isTomorrow = c.argumentDate === tomorrow;
              return (
                <div key={c.slug}>
                  <CaseTitleLink slug={c.slug} title={c.title} onSelectCase={onSelectCase} />
                  <p
                    className="text-[11px] font-normal not-italic text-[#6B6560]"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      lineHeight: 1.5,
                    }}
                  >
                    {formatDate(c.argumentDate)}
                    {isToday ? " · Today" : isTomorrow ? " · Tomorrow" : ""}
                  </p>
                  <p
                    className="text-[11px] font-normal not-italic text-[#6B6560]"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      lineHeight: 1.5,
                    }}
                  >
                    {c.caseNumber}
                  </p>
                </div>
              );
            })}
          </div>
          {cases.length > DOCKET_PAGE_SIZE && (
            <Link href="/docket/upcoming" className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              View all {cases.length} cases →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function DocketArguedPanel({ cases, onSelectCase }: { cases: CaseSummary[]; onSelectCase: (slug: string) => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Argued</p>
      {cases.length === 0 ? (
        <p className="text-center text-[13px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
          No cases.
        </p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-[1em] overflow-hidden">
            {cases.slice(0, DOCKET_PAGE_SIZE).map((c) => (
              <div key={c.slug}>
                <CaseTitleLink slug={c.slug} title={c.title} onSelectCase={onSelectCase} />
                <p
                  className="text-[11px] font-normal not-italic text-[#6B6560]"
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    lineHeight: 1.5,
                  }}
                >
                  Argued {formatDate(c.argumentDate)}
                </p>
                <p
                  className="text-[11px] font-normal not-italic text-[#6B6560]"
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    lineHeight: 1.5,
                  }}
                >
                  {c.caseNumber}
                </p>
                {c.podcastEpisodeUrl && (
                  <a
                    href={c.podcastEpisodeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      lineHeight: 1.5,
                    }}
                  >
                    Listen on Spotify ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          {cases.length > DOCKET_PAGE_SIZE && (
            <Link href="/docket/argued" className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              View all {cases.length} cases →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function DocketDecidedPanel({ items, today, onSelectCase }: { items: DecidedItem[]; today: string; onSelectCase: (slug: string) => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">Decided</p>
      {items.length === 0 ? (
        <p className="text-center text-[13px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
          No cases.
        </p>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-x-3 gap-y-[1em] overflow-hidden">
            {items.slice(0, DOCKET_PAGE_SIZE).map((item) => {
              const isToday = item.decisionDate === today;
              const caseNumber = item.sub.split(" · ")[1] ?? item.sub;
              return (
                <div key={item.slug} className="contents">
                  <div>
                    <CaseTitleLink slug={item.slug} title={item.title} onSelectCase={onSelectCase} />
                    <p
                      className="text-[11px] font-normal not-italic text-[#6B6560]"
                      style={{
                        fontFamily: "'Lora', Georgia, serif",
                        lineHeight: 1.5,
                      }}
                    >
                      {item.decisionDate ? `Decided ${formatDate(item.decisionDate)}` : "Decided"}
                      {isToday ? " · Decided Today" : ""}
                    </p>
                    <p
                      className="text-[11px] font-normal not-italic text-[#6B6560]"
                      style={{
                        fontFamily: "'Lora', Georgia, serif",
                        lineHeight: 1.5,
                      }}
                    >
                      {caseNumber}
                    </p>
                    {item.podcastEpisodeUrl && (
                      <a
                        href={item.podcastEpisodeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                        style={{
                          fontFamily: "'Lora', Georgia, serif",
                          lineHeight: 1.5,
                        }}
                      >
                        Listen on Spotify ↗
                      </a>
                    )}
                  </div>
                  <div>
                    <JusticePortraitGroup majorityAuthor={item.majorityAuthor} dissentAuthors={item.dissentAuthors} />
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > DOCKET_PAGE_SIZE && (
            <Link href="/docket/decided" className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              View all {items.length} cases →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

// All 66 decided cases from the term, same row format as DocketDecidedPanel
// (that one truncates to DOCKET_PAGE_SIZE + a "View all" link out to
// /docket/decided; this panel IS the full list, so no truncation), scrolled
// in place via ScrollableRegion -- the same always-visible-thumb scrollbar
// case panels use, since native scrollbars stay hidden on macOS overlay
// scrollbars.
// Matches any ONE of the selected justices' majority-side membership, not
// all of them together. Lifted up to SectionPanels so AllCasesMenuPanel's
// case count and AllCasesListPanel's own list are always counting the
// exact same set, never two separately-filtered lists drifting apart.
// Matches if ANY selected justice is on the given side (sideJustices) for
// this case AND, when that specific justice also has a "Joined By" filter
// set, their OWN authored opinion (found in `summaries`) was joined by ANY
// of the selected joiners. A selected justice with no joined-by filter set
// needs only to be on that side -- no further constraint.
// Matches on AUTHORSHIP (did the selected justice write this opinion),
// not side membership -- a justice who only joined someone else's
// concurrence/dissent without writing their own doesn't count here (that's
// majoritySideJustices' question, "who was on the losing side," a
// different one). Keeping this authorship-only is also what makes "Joined
// By" always meaningful: every justice this can match already has an
// entry in `summaries` for it to look joiners up in.
function matchesOpinionSide(
  summaries: { author: string; joinedBy: string[] }[],
  selectedJustices: string[],
  selectedJoinedBy: Record<string, string[]>,
): boolean {
  if (selectedJustices.length === 0) return true;
  return selectedJustices.some((key) => {
    const authored = summaries.find((s) => s.author === key);
    if (!authored) return false;
    const joinedByFilter = selectedJoinedBy[key];
    if (!joinedByFilter || joinedByFilter.length === 0) return true;
    return joinedByFilter.some((j) => authored.joinedBy.includes(j));
  });
}

function filterAllCasesItems(
  items: DecidedItem[],
  selectedMajorityAuthor: string | null,
  selectedMajorityJustices: string[],
  selectedConcurringJustices: string[],
  selectedConcurringJoinedBy: Record<string, string[]>,
  selectedDissentingJustices: string[],
  selectedDissentingJoinedBy: Record<string, string[]>,
  selectedIssue: string | null,
): DecidedItem[] {
  return items
    .filter((item) => !selectedMajorityAuthor || item.majorityAuthor === selectedMajorityAuthor)
    // Ground-truth per-justice side from public.decisions (majoritySideJustices),
    // not "not in dissentAuthors" -- dissentAuthors only lists justices who
    // separately AUTHORED a dissent, silently missing anyone who joined
    // another's dissent without writing their own.
    .filter((item) => selectedMajorityJustices.length === 0 || selectedMajorityJustices.some((key) => item.majoritySideJustices.includes(key)))
    .filter((item) => matchesOpinionSide(item.concurringSummaries, selectedConcurringJustices, selectedConcurringJoinedBy))
    .filter((item) => matchesOpinionSide(item.dissentSummaries, selectedDissentingJustices, selectedDissentingJoinedBy))
    .filter((item) => !selectedIssue || item.issueCategory?.slug === selectedIssue);
}

function AllCasesListPanel({ items, today, onSelectCase }: { items: DecidedItem[]; today: string; onSelectCase: (slug: string) => void }) {
  return (
    <ScrollableRegion outerClassName="h-full min-w-0" innerClassName="px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">All Cases</p>
      {items.length === 0 ? (
        <p className="text-center text-[13px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}>
          No cases.
        </p>
      ) : (
        <div className="grid grid-cols-[2fr_1fr] gap-x-3 gap-y-[1em]">
          {items.map((item) => {
            const isToday = item.decisionDate === today;
            const caseNumber = item.sub.split(" · ")[1] ?? item.sub;
            return (
              <div key={item.slug} className="contents">
                <div>
                  <CaseTitleLink slug={item.slug} title={item.title} onSelectCase={onSelectCase} />
                  <p
                    className="text-[11px] font-normal not-italic text-[#6B6560]"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      lineHeight: 1.5,
                    }}
                  >
                    {item.decisionDate ? `Decided ${formatDate(item.decisionDate)}` : "Decided"}
                    {isToday ? " · Decided Today" : ""}
                  </p>
                  <p
                    className="text-[11px] font-normal not-italic text-[#6B6560]"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      lineHeight: 1.5,
                    }}
                  >
                    {caseNumber}
                  </p>
                  {item.podcastEpisodeUrl && (
                    <a
                      href={item.podcastEpisodeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#C43030]"
                      style={{
                        fontFamily: "'Lora', Georgia, serif",
                        lineHeight: 1.5,
                      }}
                    >
                      Listen on Spotify ↗
                    </a>
                  )}
                </div>
                <div>
                  <JusticePortraitGroup majorityAuthor={item.majorityAuthor} dissentAuthors={item.dissentAuthors} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ScrollableRegion>
  );
}

function AllCasesImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/all-cases/all-cases.webp" alt="All Cases" fill className="object-cover object-top" />
    </div>
  );
}

function OralArgumentsImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/justices-section/oral-arguments.webp" alt="Oral Arguments" fill className="object-cover object-top" />
    </div>
  );
}

function ThirdPartySourcesImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/analysis/third-party-sources.webp" alt="Third Party Sources" fill className="object-cover object-top" />
    </div>
  );
}

function OpinionsVolumeImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/opinions-section/opinions-volume.webp" alt="Opinions Volume" fill className="object-cover object-top" />
    </div>
  );
}

// Volume > Highlights, panel 2: seven single-stat "who wins this category"
// cards -- three read straight off the justices prop already used
// elsewhere (majority/dissent/concurrence totals), four come from
// opinionJoinerHighlights (solo-opinion and most-joined-opinion stats,
// which need per-opinion joiner counts no existing accessor provided).
function HighlightStat({
  title,
  justice,
  value,
  unit,
  center = false,
  valueInTitle = false,
}: {
  title: string;
  // A single winner, or -- for a tie -- every justice sharing the max, all
  // shown (per the Concurrences/Dissents panel's "show all justices" tie
  // rule).
  justice: (typeof ALL_JUSTICES)[number] | JusticeStat | (typeof ALL_JUSTICES)[number][] | null;
  value: number | null;
  unit: string;
  center?: boolean;
  valueInTitle?: boolean;
}) {
  const justiceList = justice == null ? [] : Array.isArray(justice) ? justice : [justice];
  return (
    <div className={center ? "flex flex-col items-center text-center" : undefined}>
      <p className={`mb-[0.4em] font-serif text-[13px] font-normal text-[#6B6560] ${center ? "text-center" : "text-left"}`}>
        {title}
        {valueInTitle && value != null ? ` ${value}` : ""}
      </p>
      {justiceList.length > 0 && value != null ? (
        <>
          <div className="flex flex-col gap-[0.3em]">
            {justiceList.map((j) => (
              <JusticeChip key={j.key} justice={j} />
            ))}
          </div>
          {!valueInTitle && (
            <p className="mt-[0.3em] text-[12px] font-normal not-italic text-[#1A1A1A]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              {value} {unit}
            </p>
          )}
        </>
      ) : (
        <p className="text-[11px] font-normal italic text-[#6B6560]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          No data.
        </p>
      )}
    </div>
  );
}

function topByCount<T>(items: T[], value: (item: T) => number): T | null {
  return items.reduce<T | null>((best, item) => (!best || value(item) > value(best) ? item : best), null);
}

function VolumeHighlightsPanel({ justices, highlights }: { justices: JusticeStat[]; highlights: OpinionJoinerHighlights }) {
  const mostDissents = topByCount(justices, (j) => j.dissents);
  const mostConcurrences = topByCount(justices, (j) => j.concurrences);
  const soloConcurrenceJustice = resolveJustice(highlights.mostSoloConcurrences?.justiceSlug) ?? null;
  const soloDissentJustice = resolveJustice(highlights.mostSoloDissents?.justiceSlug) ?? null;
  const joinedConcurrenceJustices = highlights.mostJoinedConcurrences.map((j) => resolveJustice(j.justiceSlug)).filter((j): j is (typeof ALL_JUSTICES)[number] => j !== undefined);
  const joinedDissentJustices = highlights.mostJoinedDissents.map((j) => resolveJustice(j.justiceSlug)).filter((j): j is (typeof ALL_JUSTICES)[number] => j !== undefined);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-[0.9em]">
            <p className="text-left font-serif text-[14px] font-normal text-[#6B6560]">Concurrences</p>
            <HighlightStat title="Most Concurrences" justice={mostConcurrences} value={mostConcurrences?.concurrences ?? null} unit="opinions" />
            <HighlightStat title="Most Solo Concurrences" justice={soloConcurrenceJustice} value={highlights.mostSoloConcurrences?.count ?? null} unit="opinions" />
            <HighlightStat title="Joined Most Concurrences" justice={joinedConcurrenceJustices} value={highlights.mostJoinedConcurrences[0]?.count ?? null} unit="opinions" />
          </div>
          <div className="flex flex-col gap-[0.9em]">
            <p className="text-left font-serif text-[14px] font-normal text-[#6B6560]">Dissents</p>
            <HighlightStat title="Most Dissents" justice={mostDissents} value={mostDissents?.dissents ?? null} unit="opinions" />
            <HighlightStat title="Most Solo Dissents" justice={soloDissentJustice} value={highlights.mostSoloDissents?.count ?? null} unit="opinions" />
            <HighlightStat title="Joined Most Dissents" justice={joinedDissentJustices} value={highlights.mostJoinedDissents[0]?.count ?? null} unit="opinions" />
          </div>
        </div>
      </div>
    </div>
  );
}

function OpinionsVolumeHighlightsImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/opinions-section/opinions-volume-highlights.webp" alt="Opinions Volume Highlights" fill className="object-cover object-top" />
    </div>
  );
}

export function OpinionsAlignmentImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/opinions-section/opinions-alignment.webp" alt="Opinions Alignment" fill className="object-cover object-top" />
    </div>
  );
}

function JoinersImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/opinions-section/joiners.webp" alt="Joiners" fill className="object-cover object-top" />
    </div>
  );
}

export function AboutRightPanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image src="/images/about/for-about-scotus-dashboard.webp" alt="For About SCOTUS Dashboard" fill className="object-cover object-top" />
    </div>
  );
}

export function SectionPanels({ active, upcomingCases, arguedCases, decidedItems, issueCategories, justices, opinionLengthStats, justiceAgreementGrid, opinionJoinerHighlights, concurrenceJoinMatrix, dissentJoinMatrix, totalWordsByJustice, majorityMinorityRateByJustice, scotusblogArticles, otherArticles, onSelectCase, today, tomorrow, selectedMajorityAuthor, onSelectMajorityAuthor, selectedMajorityJustices, onSelectMajorityJustices, selectedConcurringJustices, onSelectConcurringJustices, selectedConcurringJoinedBy, onSelectConcurringJoinedByForJustice, selectedDissentingJustices, onSelectDissentingJustices, selectedDissentingJoinedBy, onSelectDissentingJoinedByForJustice, selectedIssue, onSelectIssue }: { active: SectionKey; upcomingCases: CaseSummary[]; arguedCases: CaseSummary[]; decidedItems: DecidedItem[]; issueCategories: { slug: string; label: string }[]; justices: JusticeStat[]; opinionLengthStats: OpinionLengthStats; justiceAgreementGrid: JusticeAgreementPair[]; opinionJoinerHighlights: OpinionJoinerHighlights; concurrenceJoinMatrix: JusticeJoinData; dissentJoinMatrix: JusticeJoinData; totalWordsByJustice: Record<string, number>; majorityMinorityRateByJustice: Record<string, JusticeMajorityMinorityRate>; scotusblogArticles: Article[]; otherArticles: Article[]; onSelectCase: (slug: string) => void; today: string; tomorrow: string; selectedMajorityAuthor: string | null; onSelectMajorityAuthor: (key: string | null) => void; selectedMajorityJustices: string[]; onSelectMajorityJustices: (keys: string[]) => void; selectedConcurringJustices: string[]; onSelectConcurringJustices: (keys: string[]) => void; selectedConcurringJoinedBy: Record<string, string[]>; onSelectConcurringJoinedByForJustice: (justiceKey: string, joiners: string[]) => void; selectedDissentingJustices: string[]; onSelectDissentingJustices: (keys: string[]) => void; selectedDissentingJoinedBy: Record<string, string[]>; onSelectDissentingJoinedByForJustice: (justiceKey: string, joiners: string[]) => void; selectedIssue: string | null; onSelectIssue: (slug: string | null) => void }) {
  const [selectedOpinionsItem, setSelectedOpinionsItem] = useState<string | null>(DEFAULT_OPINIONS_ITEM);
  // "Justices" submenu items are each justice's own displayName (see
  // OPINIONS_MENU) -- resolve the selected one back to a justice/slug so
  // panels 2 and 3 below can be generic across all nine justices.
  const selectedJustice = ALL_JUSTICES.find((j) => j.displayName === selectedOpinionsItem) ?? null;
  const selectedJusticeSlug = selectedJustice ? PERSON_SLUG_BY_JUSTICE_KEY[selectedJustice.key] : null;
  const maxTotalOpinions = Math.max(1, ...justices.map((j) => j.majorityOpinions + j.concurrences + j.dissents));
  const allCasesFilteredItems = filterAllCasesItems(
    decidedItems,
    selectedMajorityAuthor,
    selectedMajorityJustices,
    selectedConcurringJustices,
    selectedConcurringJoinedBy,
    selectedDissentingJustices,
    selectedDissentingJoinedBy,
    selectedIssue,
  );

  return (
    <>
      {active === "about" ? <AboutMiddlePanel /> : active === "docket" ? <DocketUpcomingPanel cases={upcomingCases} today={today} tomorrow={tomorrow} onSelectCase={onSelectCase} /> : active === "justices" ? <JusticesSpeakingPanel justices={justices} /> : active === "opinions" ? <OpinionsMenuPanel selectedItem={selectedOpinionsItem} onSelectItem={setSelectedOpinionsItem} /> : active === "analysis" ? <ArticleListPanel title="Legal Journalism" articles={scotusblogArticles} /> : active === "all-cases" ? <AllCasesMenuPanel
                selectedMajorityAuthor={selectedMajorityAuthor}
                onSelectMajorityAuthor={onSelectMajorityAuthor}
                selectedMajorityJustices={selectedMajorityJustices}
                onSelectMajorityJustices={onSelectMajorityJustices}
                selectedConcurringJustices={selectedConcurringJustices}
                onSelectConcurringJustices={onSelectConcurringJustices}
                selectedConcurringJoinedBy={selectedConcurringJoinedBy}
                onSelectConcurringJoinedByForJustice={onSelectConcurringJoinedByForJustice}
                selectedDissentingJustices={selectedDissentingJustices}
                onSelectDissentingJustices={onSelectDissentingJustices}
                selectedDissentingJoinedBy={selectedDissentingJoinedBy}
                onSelectDissentingJoinedByForJustice={onSelectDissentingJoinedByForJustice}
                issueCategories={issueCategories}
                selectedIssue={selectedIssue}
                onSelectIssue={onSelectIssue}
                caseCount={allCasesFilteredItems.length}
              /> : <PlaceholderPanel active={active} index={1} />}
      {active === "about" ? <AboutRightPanel /> : active === "docket" ? <DocketArguedPanel cases={arguedCases} onSelectCase={onSelectCase} /> : active === "justices" ? <OralArgumentsImagePanel /> : active === "opinions" ? selectedOpinionsItem === "Longest" ? <OpinionExtremeOverviewPanel title="Longest" averageWordCount={opinionLengthStats.averageWordCount} overall={opinionLengthStats.longestOverall} majority={opinionLengthStats.longestMajority} concurrence={opinionLengthStats.longestConcurrence} onSelectCase={onSelectCase} /> : selectedOpinionsItem === "Shortest" ? <OpinionExtremeOverviewPanel title="Shortest" averageWordCount={opinionLengthStats.averageWordCount} overall={opinionLengthStats.shortestOverall} majority={opinionLengthStats.shortestMajority} concurrence={opinionLengthStats.shortestConcurrence} onSelectCase={onSelectCase} /> : selectedOpinionsItem === "All" ? <VolumeByJusticePanel justices={justices} highlights={opinionJoinerHighlights} onSelectCase={onSelectCase} /> : selectedOpinionsItem === "Concurrences and Dissents" ? <VolumeHighlightsPanel justices={justices} highlights={opinionJoinerHighlights} /> : selectedOpinionsItem === "All Votes" ? <JusticeAgreementPanel pairs={justiceAgreementGrid} /> : selectedOpinionsItem === "Joiners" ? <ConcurrenceJoinPanel concurrenceData={concurrenceJoinMatrix} dissentData={dissentJoinMatrix} /> : selectedJusticeSlug ? <JusticeTotalWordsPanel totalWords={totalWordsByJustice[selectedJusticeSlug] ?? 0} longest={opinionLengthStats.longestByJustice.find((r) => r.justiceSlug === selectedJusticeSlug) ?? null} shortest={opinionLengthStats.shortestByJustice.find((r) => r.justiceSlug === selectedJusticeSlug) ?? null} justiceSlug={selectedJusticeSlug} justice={justices.find((j) => j.key === selectedJustice?.key) ?? null} maxTotal={maxTotalOpinions} onSelectCase={onSelectCase} /> : <PlaceholderPanel active={active} index={2} /> : active === "analysis" ? <ThirdPartySourcesImagePanel /> : active === "all-cases" ? <AllCasesListPanel items={allCasesFilteredItems} today={today} onSelectCase={onSelectCase} /> : <PlaceholderPanel active={active} index={2} />}
      {active === "about" ? <AboutLeftPanel /> : active === "docket" ? <DocketDecidedPanel items={decidedItems} today={today} onSelectCase={onSelectCase} /> : active === "justices" ? <JusticesOpinionsPanel justices={justices} /> : active === "opinions" ? selectedOpinionsItem === "Longest" ? <OpinionExtremeByJusticePanel title="Longest" data={opinionLengthStats.longestByJustice} onSelectCase={onSelectCase} /> : selectedOpinionsItem === "Shortest" ? <OpinionExtremeByJusticePanel title="Shortest" data={opinionLengthStats.shortestByJustice} onSelectCase={onSelectCase} /> : selectedOpinionsItem === "All" ? <OpinionsVolumeImagePanel /> : selectedOpinionsItem === "Concurrences and Dissents" ? <OpinionsVolumeHighlightsImagePanel /> : selectedOpinionsItem === "All Votes" ? <OpinionsAlignmentImagePanel /> : selectedOpinionsItem === "Joiners" ? <JoinersImagePanel /> : selectedJusticeSlug ? <MajorityMinorityBarChart rate={majorityMinorityRateByJustice[selectedJusticeSlug] ?? null} agreementPairs={justiceAgreementGrid} justiceSlug={selectedJusticeSlug} /> : <PlaceholderPanel active={active} index={3} /> : active === "analysis" ? <ArticleListPanel title="General Journalism" articles={otherArticles} /> : active === "all-cases" ? <AllCasesImagePanel /> : <PlaceholderPanel active={active} index={3} />}
    </>
  );
}
