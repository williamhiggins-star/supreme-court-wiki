/**
 * docket-proceedings.ts
 *
 * Parses a SCOTUS docket page's "Proceedings and Orders" table -- the
 * chronological filing/order log -- into structured entries, and
 * classifies each entry's document type by keyword.
 *
 * Distinct from update-cases.ts's/process-upcoming.ts's fetchDocketPage(),
 * which strips ALL tags from the same page (discarding dates, entry
 * boundaries, and every document link's href) to build a plain-text blob
 * for an LLM case-summary prompt. That function still does its job
 * unchanged; this one is a real parser against the actual
 * `<table class="ProceedingItem">` markup, for a different purpose (a
 * "Proceedings & Documents" case panel), and captures every entry -- no
 * character truncation.
 */

const SCOTUS_DOCKET_BASE =
  "https://www.supremecourt.gov/docket/docketfiles/html/public";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SupremeCourtWiki/1.0; +https://github.com/supreme-court-wiki)";

export interface DocketDocumentLink {
  label: string;
  url: string;
}

export type DocketDocumentType =
  | "petition_response"
  | "merits_brief"
  | "amicus_brief"
  | "motion"
  | "order_scheduling"
  | "record"
  | "other";

export interface ParsedDocketEntry {
  date: string; // ISO YYYY-MM-DD
  description: string;
  documentType: DocketDocumentType;
  documents: DocketDocumentLink[];
  sortOrder: number; // 0-based, page order (SCOTUS lists entries chronologically ascending)
}

const MONTH_ABBR: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function parseProceedingDate(raw: string): string | null {
  // "Aug 08 2025"
  const m = raw.trim().match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_ABBR[m[1]];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Parses the raw docket HTML's `<table class="ProceedingItem">` entries.
 * Each entry is one <tr> with a `ProceedingDate` <td> and a second <td>
 * holding the description plus a `documentlinks` span of 0-N <a> tags.
 * Real markup observed (2026-09-18, case 25-170): the <a> tags' href
 * attribute is unquoted (`href= https://...pdf`), so the link regex below
 * matches up to the next whitespace rather than a closing quote.
 */
export function parseDocketProceedingsHtml(html: string): Omit<ParsedDocketEntry, "documentType">[] {
  const entryRe = /<td class="ProceedingDate">([^<]+)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
  const linkRe = /<a\s+href=\s*([^\s>]+)[^>]*>([^<]*)<\/a>/gi;

  const entries: Omit<ParsedDocketEntry, "documentType">[] = [];
  let match: RegExpExecArray | null;
  let sortOrder = 0;

  while ((match = entryRe.exec(html)) !== null) {
    const date = parseProceedingDate(decodeEntities(match[1]));
    if (!date) continue; // skip anything that isn't a real dated proceeding row

    const cellHtml = match[2];
    const linksSplit = cellHtml.split(/<span class="documentlinks">/i);
    const descriptionHtml = linksSplit[0];
    const linksHtml = linksSplit[1] ?? "";

    const description = decodeEntities(descriptionHtml)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const documents: DocketDocumentLink[] = [];
    let linkMatch: RegExpExecArray | null;
    linkRe.lastIndex = 0;
    while ((linkMatch = linkRe.exec(linksHtml)) !== null) {
      const url = linkMatch[1].trim();
      const label = decodeEntities(linkMatch[2]).replace(/\s{2,}/g, " ").trim();
      if (url && label) documents.push({ label, url });
    }

    entries.push({ date, description, documents, sortOrder: sortOrder++ });
  }

  return entries;
}

export async function fetchDocketProceedingsHtml(caseNumber: string): Promise<string> {
  const url = `${SCOTUS_DOCKET_BASE}/${caseNumber}.html`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Docket fetch failed: HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Per-entry keyword rules, checked in order (first match wins). Reasoning
 * for the ordering, confirmed against Suncor's (25-170) real 115 entries:
 *
 *  1. amicus_brief   -- "amicus"/"amici curiae" anywhere. Checked first
 *     since an amicus filing never overlaps with the other categories'
 *     keywords (e.g. no amicus entry also contains "record" or "motion").
 *  2. record         -- "record" as its own word (requested/received from
 *     the lower court). Real dockets never pair this with "brief"/"motion".
 *  3. order_scheduling -- court-issued dispositions and calendar events:
 *     "motion ... granted/denied" (the ORDER on a motion, not the motion
 *     itself -- checked before the plain "motion" rule below), "distributed
 *     for conference", "set for argument", "petition granted", "circulated",
 *     "response requested", "argued.", "submitted.".
 *  4. motion         -- "motion" not already caught by #3 above, i.e. the
 *     motion's own filing ("Motion to extend...", "Motion of the Solicitor
 *     General for leave to participate...").
 *  5. petition_response -- cert-stage filings: the petition itself, a
 *     waiver of the right to respond, and "brief ... in opposition" --
 *     that "in opposition" phrase is what distinguishes a cert-stage
 *     opposition brief from an identically-worded merits-stage party
 *     brief below, so it's checked before #6.
 *  6. merits_brief   -- "brief of petitioner/respondent" (no "in
 *     opposition"), plus "joint appendix".
 *  7. other          -- fallback (letters, corporate disclosure statements,
 *     erratum notices -- procedural filings that aren't a brief, motion,
 *     order, or the record itself).
 *
 * One case these per-entry rules cannot resolve on their own: "Reply of
 * petitioner(s) ... filed" appears TWICE in Suncor's real docket with
 * IDENTICAL wording -- once at cert stage (2025-11-25, before cert was
 * granted) and once at merits stage (2026-08-26, the actual reply brief
 * shortly before argument). No keyword distinguishes them; only their
 * position relative to the cert grant does. classifyDocketEntries() below
 * handles this with a stateful pass -- classifyDocketEntry() alone always
 * calls a bare "Reply of petitioner/respondent ... filed" petition_response,
 * which is only correct for the cert-stage occurrence.
 */
export function classifyDocketEntry(description: string): DocketDocumentType {
  const d = description.toLowerCase();

  if (/\bamicus\b|\bamici\b/.test(d)) return "amicus_brief";
  if (/\brecord\b/.test(d)) return "record";

  if (
    /\bmotion\b[^.]*\b(granted|denied)\b/.test(d) ||
    /distributed for conference|set for argument|petition granted|\bcirculated\b|response requested|^argued\.?$|^submitted\.?$/.test(d)
  ) {
    return "order_scheduling";
  }
  if (/\bmotion\b/.test(d)) return "motion";

  if (/petition for a writ of certiorari|waiver of right|brief[^.]*in opposition/.test(d)) {
    return "petition_response";
  }
  if (/brief of (?:petitioner|respondent)|joint appendix/.test(d)) return "merits_brief";

  return "other";
}

/**
 * Wraps classifyDocketEntry() with the one stateful exception described
 * above: a bare "Reply of petitioner/respondent ... filed" (no "in
 * opposition", no "brief of") is petition_response before the cert grant,
 * merits_brief after it. The grant is detected the same way
 * classifyDocketEntry() itself detects "Petition GRANTED." for
 * order_scheduling, so the two stay consistent with each other.
 */
export function classifyDocketEntries(
  entries: { description: string }[],
): DocketDocumentType[] {
  const grantIndex = entries.findIndex((e) => /petition granted/i.test(e.description));

  return entries.map((e, i) => {
    const base = classifyDocketEntry(e.description);
    const isBareReply = /^reply of (?:petitioner|respondent)/i.test(e.description.trim());
    if (base === "other" && isBareReply) {
      return grantIndex === -1 || i < grantIndex ? "petition_response" : "merits_brief";
    }
    return base;
  });
}
