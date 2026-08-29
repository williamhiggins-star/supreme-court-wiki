"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SectionKey } from "@/lib/dashboard2-sections";
import type { CaseSummary, Article } from "@/types";
import type { DecidedItem } from "@/app/page";
import type { JusticeStat } from "@/lib/justices";

const DOCKET_PAGE_SIZE = 4;
const ARTICLE_PAGE_SIZE = 6;

// Every case title opens the in-place case-panel view (see CaseDetailPanels)
// instead of navigating to /cases/[slug].
function CaseTitleLink({
  slug,
  title,
  onSelectCase,
}: {
  slug: string;
  title: string;
  onSelectCase: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectCase(slug)}
      className="block border-0 bg-transparent p-0 text-left text-[13px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
      style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.4 }}
    >
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
  { key: "roberts", displayName: "Chief Justice Roberts", photo: "/images/justices/roberts.jpg" },
  { key: "thomas", displayName: "Justice Thomas", photo: "/images/justices/thomas.jpg" },
  { key: "alito", displayName: "Justice Alito", photo: "/images/justices/alito.jpg" },
  { key: "sotomayor", displayName: "Justice Sotomayor", photo: "/images/justices/sotomayor.jpg" },
  { key: "kagan", displayName: "Justice Kagan", photo: "/images/justices/kagan.jpg" },
  { key: "gorsuch", displayName: "Justice Gorsuch", photo: "/images/justices/gorsuch.jpg" },
  { key: "kavanaugh", displayName: "Justice Kavanaugh", photo: "/images/justices/kavanaugh.jpg" },
  { key: "barrett", displayName: "Justice Barrett", photo: "/images/justices/barrett.jpg" },
  { key: "jackson", displayName: "Justice Jackson", photo: "/images/justices/jackson.jpg" },
];

function JusticePortraitGroup({
  majorityAuthor,
  dissentAuthors,
}: {
  majorityAuthor?: string;
  dissentAuthors: string[];
}) {
  if (!majorityAuthor) {
    return (
      <p
        className="text-[11px] font-normal not-italic text-[#6B6560]"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        —
      </p>
    );
  }
  const dissentSet = new Set(dissentAuthors);
  const majority = ALL_JUSTICES.filter((j) => !dissentSet.has(j.key));
  const dissent = ALL_JUSTICES.filter((j) => dissentSet.has(j.key));

  return (
    <div className="flex flex-col gap-[0.5em]">
      <div>
        <p
          className="mb-0.5 text-[9px] font-normal uppercase tracking-wider not-italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          {dissent.length === 0 ? "Unanimous" : "Majority"}
        </p>
        <div className="flex flex-wrap gap-1">
          {majority.map((j) => (
            <Image
              key={j.key}
              src={j.photo}
              alt={j.displayName}
              width={16}
              height={16}
              className="rounded-full object-cover object-top"
              style={{ width: 16, height: 16 }}
            />
          ))}
        </div>
      </div>
      {dissent.length > 0 && (
        <div>
          <p
            className="mb-0.5 text-[9px] font-normal uppercase tracking-wider not-italic text-[#6B6560]"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Dissent
          </p>
          <div className="flex flex-wrap gap-1">
            {dissent.map((j) => (
              <Image
                key={j.key}
                src={j.photo}
                alt={j.displayName}
                width={16}
                height={16}
                className="rounded-full object-cover object-top"
                style={{ width: 16, height: 16 }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JusticeDualBarRow({
  justice: j,
  maxMinutes,
  maxQuestions,
}: {
  justice: JusticeStat;
  maxMinutes: number;
  maxQuestions: number;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className="mb-[0.8em] flex items-center gap-2"
      onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(null)}
    >
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{ left: hover.x, top: hover.y - 10, fontFamily: "'Lora', Georgia, serif" }}
        >
          {j.displayName}
        </span>
      )}
      <Image
        src={j.photo}
        alt={j.displayName}
        width={20}
        height={20}
        className="shrink-0 rounded-full object-cover object-top"
        style={{ width: 20, height: 20 }}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
            <div
              className="h-full rounded-full"
              style={{ width: `${(j.estimatedMinutes / maxMinutes) * 100}%`, backgroundColor: "#B85C38" }}
            />
          </div>
          <p
            className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            {j.estimatedMinutes.toLocaleString()} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
            <div
              className="h-full rounded-full"
              style={{ width: `${(j.questions / maxQuestions) * 100}%`, backgroundColor: "#2C4A3E" }}
            />
          </div>
          <p
            className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
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
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Speaking Time &amp; Turns
      </p>
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
    <div
      className="mb-[0.6em] flex items-center gap-2"
      onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(null)}
    >
      {hover && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1A1A1A] px-2 py-1 text-[10px] text-white"
          style={{ left: hover.x, top: hover.y - 10, fontFamily: "'Lora', Georgia, serif" }}
        >
          {j.displayName}
        </span>
      )}
      <Image
        src={j.photo}
        alt={j.displayName}
        width={20}
        height={20}
        className="shrink-0 rounded-full object-cover object-top"
        style={{ width: 20, height: 20 }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F5F0E8]">
          <div className="flex h-full" style={{ width: `${barPct}%` }}>
            {j.majorityOpinions > 0 && (
              <div className="h-full" style={{ width: `${majPct}%`, backgroundColor: "#2C4A3E" }} />
            )}
            {j.concurrences > 0 && (
              <div className="h-full" style={{ width: `${concPct}%`, backgroundColor: "#8B6914" }} />
            )}
            {j.dissents > 0 && (
              <div className="h-full" style={{ width: `${disPct}%`, backgroundColor: "#B85C38" }} />
            )}
          </div>
        </div>
        <p
          className="shrink-0 whitespace-nowrap text-[10px] font-normal not-italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          {total} op{total !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

function JusticesOpinionsPanel({ justices }: { justices: JusticeStat[] }) {
  const maxOpinions = Math.max(
    1,
    ...justices.map((j) => j.majorityOpinions + j.concurrences + j.dissents)
  );
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Opinions
      </p>
      <div className="min-h-0 flex-1 overflow-hidden">
        {justices.map((j) => (
          <JusticeOpinionRow key={j.key} justice={j} maxOpinions={maxOpinions} />
        ))}
      </div>
      <div className="mt-[0.4em] flex items-center justify-center gap-3">
        <span
          className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#2C4A3E" }} />
          Majority
        </span>
        <span
          className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#8B6914" }} />
          Concurring
        </span>
        <span
          className="flex items-center gap-1 text-[9px] font-normal not-italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: "#B85C38" }} />
          Dissenting
        </span>
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
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        {title}
      </p>
      {articles.length === 0 ? (
        <p
          className="text-center text-[13px] font-normal italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
        >
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
                  className="block text-[13px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
                  style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.4 }}
                >
                  {a.title}
                </a>
                <p
                  className="text-[11px] font-normal not-italic text-[#6B6560]"
                  style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                >
                  {a.source}
                  {a.author ? ` · ${a.author}` : ""} · {a.publishedAt}
                </p>
              </div>
            ))}
          </div>
          {articles.length > ARTICLE_PAGE_SIZE && (
            <Link
              href="/analysis"
              className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
            >
              View all {articles.length} articles →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

const SOURCES = [
  { label: "Supreme Court of the United States", href: "https://www.supremecourt.gov" },
  { label: "CourtListener", href: "https://www.courtlistener.com" },
  { label: "SCOTUSblog", href: "https://www.scotusblog.com" },
  { label: "The Atlantic", href: "https://www.theatlantic.com" },
  { label: "The New Yorker", href: "https://www.newyorker.com" },
  { label: "New York Magazine (Intelligencer)", href: "https://nymag.com/intelligencer/" },
  { label: "Supreme Court Oral Arguments Podcast", href: "https://open.spotify.com" },
  { label: "The Washington Post", href: "https://www.washingtonpost.com" },
  { label: "The Dispatch", href: "https://thedispatch.com" },
  { label: "Financial Times", href: "https://www.ft.com" },
  { label: "The New York Times", href: "https://www.nytimes.com" },
];

function AboutLeftPanel() {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-6 pt-[19px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Founder - Admin
      </p>
      <div
        className="mb-[1.5em] flex flex-col items-center gap-[1.5em] text-center text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
      >
        <p>
          <a
            href="https://www.linkedin.com/in/williampatrickhiggins/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[#B85C38]"
          >
            William Higgins
          </a>
        </p>
      </div>
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Comments, Corrections, or Suggestions?
      </p>
      <p
        className="mb-[1.5em] text-center text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
      >
        <a
          href="mailto:william.higgins@sciencespo.fr"
          className="transition-colors hover:text-[#B85C38]"
        >
          william.higgins@sciencespo.fr
        </a>
      </p>
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Updates
      </p>
      <p
        className="mb-[1.5em] text-center text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
      >
        The site is updated automatically each day at 5pm ET.
      </p>
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Sources
      </p>
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
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[#B85C38]"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AboutMiddlePanel() {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-6 pt-[19px]">
      <p className="mb-[1.5em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Welcome to SCOTUS Dashboard
      </p>
      <div
        className="flex flex-col gap-[1.5em] text-[13px] font-normal not-italic text-[#1A1A1A]"
        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
      >
        <p>
          This site tracks recent and upcoming cases before the Supreme
          Court. It is meant to orient readers through basic analysis of the
          cases including their fact patterns, the legal questions at hand,
          the positions of the different parties to the case, and legal
          opinions from experts and journalists. The site is best used as a
          starting point to dig deeper into these cases though primary and
          secondary sources, all of which should be linked throughout the
          site.
        </p>
        <p>
          The site uses AI to compile case information directly from
          official Supreme Court records, including transcripts, docket
          filings, and published opinions. Summaries, legal terminology
          explanations, litigant positions, etc, are also generated using
          AI. They should not be treated as legal advice or authoritative
          legal commentary. This site is intended for public information and
          research purposes.
        </p>
      </div>
    </div>
  );
}

function DocketUpcomingPanel({
  cases,
  today,
  tomorrow,
  onSelectCase,
}: {
  cases: CaseSummary[];
  today: string;
  tomorrow: string;
  onSelectCase: (slug: string) => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Upcoming
      </p>
      {cases.length === 0 ? (
        <p
          className="text-center text-[13px] font-normal italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
        >
          No cases scheduled.
        </p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-[1em] overflow-hidden">
            {cases.slice(0, DOCKET_PAGE_SIZE).map((c) => {
              const isToday = c.argumentDate === today;
              const isTomorrow = c.argumentDate === tomorrow;
              return (
                <div key={c.slug}>
                  <CaseTitleLink
                    slug={c.slug}
                    title={c.title}
                    onSelectCase={onSelectCase}
                  />
                  <p
                    className="text-[11px] font-normal not-italic text-[#6B6560]"
                    style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                  >
                    {formatDate(c.argumentDate)}
                    {isToday ? " · Today" : isTomorrow ? " · Tomorrow" : ""}
                  </p>
                  <p
                    className="text-[11px] font-normal not-italic text-[#6B6560]"
                    style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                  >
                    {c.caseNumber}
                  </p>
                </div>
              );
            })}
          </div>
          {cases.length > DOCKET_PAGE_SIZE && (
            <Link
              href="/docket/upcoming"
              className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
            >
              View all {cases.length} cases →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function DocketArguedPanel({
  cases,
  onSelectCase,
}: {
  cases: CaseSummary[];
  onSelectCase: (slug: string) => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Argued
      </p>
      {cases.length === 0 ? (
        <p
          className="text-center text-[13px] font-normal italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
        >
          No cases.
        </p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-[1em] overflow-hidden">
            {cases.slice(0, DOCKET_PAGE_SIZE).map((c) => (
              <div key={c.slug}>
                <CaseTitleLink
                  slug={c.slug}
                  title={c.title}
                  onSelectCase={onSelectCase}
                />
                <p
                  className="text-[11px] font-normal not-italic text-[#6B6560]"
                  style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                >
                  Argued {formatDate(c.argumentDate)}
                </p>
                <p
                  className="text-[11px] font-normal not-italic text-[#6B6560]"
                  style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                >
                  {c.caseNumber}
                </p>
                {c.podcastEpisodeUrl && (
                  <a
                    href={c.podcastEpisodeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
                    style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                  >
                    Listen on Spotify ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          {cases.length > DOCKET_PAGE_SIZE && (
            <Link
              href="/docket/argued"
              className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
            >
              View all {cases.length} cases →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function DocketDecidedPanel({
  items,
  today,
  onSelectCase,
}: {
  items: DecidedItem[];
  today: string;
  onSelectCase: (slug: string) => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-6 pb-2 pt-[14px]">
      <p className="mb-[0.75em] text-center font-serif text-[14px] font-normal text-[#6B6560]">
        Decided
      </p>
      {items.length === 0 ? (
        <p
          className="text-center text-[13px] font-normal italic text-[#6B6560]"
          style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.7 }}
        >
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
                    <CaseTitleLink
                      slug={item.slug}
                      title={item.title}
                      onSelectCase={onSelectCase}
                    />
                    <p
                      className="text-[11px] font-normal not-italic text-[#6B6560]"
                      style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                    >
                      {item.decisionDate ? `Decided ${formatDate(item.decisionDate)}` : "Decided"}
                      {isToday ? " · Decided Today" : ""}
                    </p>
                    <p
                      className="text-[11px] font-normal not-italic text-[#6B6560]"
                      style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                    >
                      {caseNumber}
                    </p>
                    {item.podcastEpisodeUrl && (
                      <a
                        href={item.podcastEpisodeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
                        style={{ fontFamily: "'Lora', Georgia, serif", lineHeight: 1.5 }}
                      >
                        Listen on Spotify ↗
                      </a>
                    )}
                  </div>
                  <div>
                    <JusticePortraitGroup
                      majorityAuthor={item.majorityAuthor}
                      dissentAuthors={item.dissentAuthors}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {items.length > DOCKET_PAGE_SIZE && (
            <Link
              href="/docket/decided"
              className="mt-[0.4em] text-center text-[12px] font-normal not-italic text-[#1A1A1A] transition-colors hover:text-[#B85C38]"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
            >
              View all {items.length} cases →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function OralArgumentsImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image
        src="/images/justices-section/oral-arguments.webp"
        alt="Oral Arguments"
        fill
        className="object-cover object-top"
      />
    </div>
  );
}

function ThirdPartySourcesImagePanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image
        src="/images/analysis/third-party-sources.webp"
        alt="Third Party Sources"
        fill
        className="object-cover object-top"
      />
    </div>
  );
}

function AboutRightPanel() {
  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Image
        src="/images/about/for-about-scotus-dashboard.webp"
        alt="For About SCOTUS Dashboard"
        fill
        className="object-cover object-top"
      />
    </div>
  );
}

export function SectionPanels({
  active,
  upcomingCases,
  arguedCases,
  decidedItems,
  justices,
  scotusblogArticles,
  otherArticles,
  onSelectCase,
  today,
  tomorrow,
}: {
  active: SectionKey;
  upcomingCases: CaseSummary[];
  arguedCases: CaseSummary[];
  decidedItems: DecidedItem[];
  justices: JusticeStat[];
  scotusblogArticles: Article[];
  otherArticles: Article[];
  onSelectCase: (slug: string) => void;
  today: string;
  tomorrow: string;
}) {
  return (
    <>
      {active === "about" ? (
        <AboutMiddlePanel />
      ) : active === "docket" ? (
        <DocketUpcomingPanel
          cases={upcomingCases}
          today={today}
          tomorrow={tomorrow}
          onSelectCase={onSelectCase}
        />
      ) : active === "justices" ? (
        <JusticesSpeakingPanel justices={justices} />
      ) : active === "analysis" ? (
        <ArticleListPanel title="Legal Journalism" articles={scotusblogArticles} />
      ) : (
        <PlaceholderPanel active={active} index={1} />
      )}
      {active === "about" ? (
        <AboutRightPanel />
      ) : active === "docket" ? (
        <DocketArguedPanel cases={arguedCases} onSelectCase={onSelectCase} />
      ) : active === "justices" ? (
        <OralArgumentsImagePanel />
      ) : active === "analysis" ? (
        <ThirdPartySourcesImagePanel />
      ) : (
        <PlaceholderPanel active={active} index={2} />
      )}
      {active === "about" ? (
        <AboutLeftPanel />
      ) : active === "docket" ? (
        <DocketDecidedPanel items={decidedItems} today={today} onSelectCase={onSelectCase} />
      ) : active === "justices" ? (
        <JusticesOpinionsPanel justices={justices} />
      ) : active === "analysis" ? (
        <ArticleListPanel title="General Journalism" articles={otherArticles} />
      ) : (
        <PlaceholderPanel active={active} index={3} />
      )}
    </>
  );
}
