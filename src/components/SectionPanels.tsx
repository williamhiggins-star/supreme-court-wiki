"use client";

import Image from "next/image";
import type { SectionKey } from "@/lib/dashboard2-sections";

function PlaceholderPanel({ active, index }: { active: SectionKey; index: number }) {
  return (
    <div className="flex h-full min-w-0 items-center justify-center border border-dashed border-[#C4A882]">
      <span className="font-mono text-xs uppercase tracking-wider text-[#6B6560]">
        {active} — panel {index}
      </span>
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
    <div className="flex h-full min-w-0 flex-col overflow-hidden p-6">
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
    <div className="flex h-full min-w-0 flex-col overflow-hidden p-6">
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

export function SectionPanels({ active }: { active: SectionKey }) {
  return (
    <>
      {active === "about" ? (
        <AboutMiddlePanel />
      ) : (
        <PlaceholderPanel active={active} index={1} />
      )}
      {active === "about" ? (
        <AboutRightPanel />
      ) : (
        <PlaceholderPanel active={active} index={2} />
      )}
      {active === "about" ? (
        <AboutLeftPanel />
      ) : (
        <PlaceholderPanel active={active} index={3} />
      )}
    </>
  );
}
