/**
 * Parsing for the Court's "Orders of the Court" listing and its order
 * PDFs (order lists and miscellaneous orders), as text from
 * `pdftotext -layout`. Pure functions, no I/O.
 *
 * Records only these actions, with their glossary codes
 * (court_vocabulary):
 *   CERTIORARI GRANTED            → petition_granted / granted_limited_to_question
 *   CERTIORARI DENIED             → petition_denied
 *   CERTIORARI -- SUMMARY DISPOSITION(S), "granted … vacated … remanded"
 *                                 → granted_vacated_remanded
 *   "probable jurisdiction noted" → probable_jurisdiction_noted
 *   per curiam opinion attached to the order list that grants the
 *   petition and reverses or vacates → summary_disposition
 * Applications (25A…), motions (25M…), original actions and everything
 * else are skipped.
 */

export interface ListedOrder {
  /** "10/05/26" as listed. */
  listedDate: string;
  /** Absolute URL of the PDF. */
  url: string;
  /** "Order List" or "Miscellaneous Order". */
  label: string;
}

export type OrderActionCode =
  | "petition_granted"
  | "granted_limited_to_question"
  | "probable_jurisdiction_noted"
  | "petition_denied"
  | "granted_vacated_remanded"
  | "summary_disposition";

export interface ParsedAction {
  docketNumber: string;
  action: OrderActionCode;
  /** YYYY-MM-DD: the order's date (for a per curiam, its "Decided" date). */
  actionDate: string;
  /** The Court's own words: the docket line(s) and the order's text. */
  courtText: string;
}

export interface ParsedOrder {
  /** YYYY-MM-DD from the order's date line ("MONDAY, OCTOBER 5, 2026");
   *  null for an order that isn't an order list (e.g. a Circuit Justice's
   *  in-chambers order on an application), which records nothing. */
  orderDate: string | null;
  actions: ParsedAction[];
  /** All-caps lines that looked like section headings but aren't known. */
  unknownHeadings: string[];
}

const COURT_ORIGIN = "https://www.supremecourt.gov";

/** Every order PDF on an /orders/ordersofthecourt/{YY} page. */
export function parseOrdersListing(html: string): ListedOrder[] {
  const out: ListedOrder[] = [];
  const re = /(\d\d\/\d\d\/\d\d)\s*&nbsp;<\/span>\s*<span[^>]*>\s*<a href=['"]([^'"]+\.pdf)['"][^>]*>([^<]+)<\/a>/g;
  for (const m of html.matchAll(re)) {
    out.push({ listedDate: m[1], url: new URL(m[2], COURT_ORIGIN).href, label: m[3].trim() });
  }
  return out;
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/** "OCTOBER 5, 2026" (any case) → "2026-10-05". */
function isoDate(month: string, day: string, year: string): string | null {
  const i = MONTHS.indexOf(month.toUpperCase());
  if (i < 0) return null;
  return `${year}-${String(i + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

type Section = "summary" | "granted" | "denied" | "other";

const HEADINGS: Record<string, Section> = {
  "CERTIORARI -- SUMMARY DISPOSITIONS": "summary",
  "CERTIORARI -- SUMMARY DISPOSITION": "summary",
  "CERTIORARI GRANTED": "granted",
  "CERTIORARI DENIED": "denied",
  "ORDERS IN PENDING CASES": "other",
  "ORDER IN PENDING CASE": "other",
  "HABEAS CORPUS DENIED": "other",
  "MANDAMUS DENIED": "other",
  "PROHIBITION DENIED": "other",
  "REHEARINGS DENIED": "other",
  "REHEARING DENIED": "other",
  "ATTORNEY DISCIPLINE": "other",
};

/** "25-901       GARCIA, …" or "25-238    )   VIRAMONTES, …": docket
 *  number, then at least two spaces (layout columns), then the caption. */
const DOCKET_LINE = /^(\d{2}-\d{1,5}|\d{2}[AM]\d{1,5}|\d+,\s*ORIG\.|D-\d+)\s{2,}(\)\s+)?(\S.*)$/;
/** Paid and in forma pauperis petitions only. */
const PETITION_DOCKET = /^\d{2}-\d{1,5}$/;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

interface Entry {
  section: Section;
  heading: string;
  dockets: { number: string; line: string; bracketed: boolean }[];
  text: string[];
}

export function parseOrderText(text: string): ParsedOrder {
  const lines = text.split("\n");
  let orderDate: string | null = null;
  for (const l of lines.slice(0, 15)) {
    const m = l.match(/^\s*(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),\s+([A-Z]+)\s+(\d{1,2}),\s+(\d{4})\s*$/);
    if (m) {
      orderDate = isoDate(m[1], m[2], m[3]);
      break;
    }
  }
  if (!orderDate) {
    if (!lines.some((l) => /^\s*\(ORDER LIST:/.test(l))) return { orderDate: null, actions: [], unknownHeadings: [] };
    throw new Error("order list date line not found");
  }

  // The order itself ends where attached opinions begin.
  let bodyEnd = lines.findIndex((l) => /^\s*Cite as:/.test(l) || l.trim() === "SUPREME COURT OF THE UNITED STATES");
  if (bodyEnd < 0) bodyEnd = lines.length;

  const entries: Entry[] = [];
  const unknownHeadings: string[] = [];
  let section: Section = "other";
  let heading = "";
  let current: Entry | null = null;

  for (const raw of lines.slice(0, bodyEnd)) {
    const t = norm(raw);
    if (!t || /^\d+$/.test(t) || t === ")" || /^\(\d{2}A\d+\)$/.test(t) || /^\(ORDER LIST:/.test(t)) continue;
    if (HEADINGS[t] !== undefined) {
      section = HEADINGS[t];
      heading = t;
      current = null;
      continue;
    }
    const d = raw.trim().match(DOCKET_LINE);
    if (d) {
      const docket = { number: norm(d[1]), line: `${norm(d[1])} ${norm(d[3])}`, bracketed: !!d[2] };
      // A docket line right after another (no text between) joins it.
      if (current && current.text.length === 0 && current.section === section) current.dockets.push(docket);
      else {
        current = { section, heading, dockets: [docket], text: [] };
        entries.push(current);
      }
      continue;
    }
    if (/^[A-Z][A-Z -]+$/.test(t) && raw.search(/\S/) >= 15 && /DENIED|GRANTED|DISPOSITION|PENDING|JURISDICTION|APPEAL/.test(t)) {
      unknownHeadings.push(t);
      section = "other";
      heading = t;
      current = null;
      continue;
    }
    if (current) current.text.push(t);
  }

  const actions: ParsedAction[] = [];
  for (const e of entries) {
    for (const group of splitDeniedRuns(e)) {
      const action = classify(group.section, group.text);
      if (!action) continue;
      const courtText =
        group.text.length > 0
          ? [...group.dockets.map((x) => x.line), group.text].join("\n")
          : [e.heading, ...group.dockets.map((x) => x.line)].join("\n");
      for (const x of group.dockets) {
        if (!PETITION_DOCKET.test(x.number)) continue;
        actions.push({ docketNumber: x.number, action, actionDate: orderDate, courtText });
      }
    }
  }

  actions.push(...parsePerCuriams(lines.slice(bodyEnd)));
  return { orderDate, actions, unknownHeadings };
}

/**
 * In CERTIORARI DENIED, dockets listed one under another without text are
 * each simply denied; text that follows applies only to the docket just
 * before it, or to its bracketed group ("25-7403  )  …"). Elsewhere a run
 * of docket lines shares the text that follows it.
 */
function splitDeniedRuns(e: Entry): { section: Section; dockets: Entry["dockets"]; text: string }[] {
  const text = e.text.join(" ");
  if (e.section !== "denied" || e.dockets.length === 1) return [{ section: e.section, dockets: e.dockets, text }];
  let start = e.dockets.length - 1;
  if (e.dockets[start].bracketed) while (start > 0 && e.dockets[start - 1].bracketed) start--;
  const groups = e.dockets.slice(0, start).map((x) => ({ section: e.section, dockets: [x], text: "" }));
  groups.push({ section: e.section, dockets: e.dockets.slice(start), text });
  return groups;
}

function classify(section: Section, text: string): OrderActionCode | null {
  if (/probable jurisdiction (?:is )?noted|notes? probable jurisdiction/i.test(text)) return "probable_jurisdiction_noted";
  switch (section) {
    case "granted":
      if (/granted limited to/i.test(text)) return "granted_limited_to_question";
      return "petition_granted";
    case "denied":
      // Rule 39.8 dismissals are listed here too but aren't denials.
      if (/dismiss/i.test(text) && !/certiorari[^.]*(?:is|are)\s+denied/i.test(text)) return null;
      return "petition_denied";
    case "summary":
      if (/certiorari[^.]*(?:is|are)\s+granted/i.test(text) && /vacated/i.test(text) && /remanded/i.test(text)) return "granted_vacated_remanded";
      return null;
    default:
      return null;
  }
}

/**
 * Per curiam opinions attached after the order: "No. 25–180. Decided
 * December 8, 2025" … "PER CURIAM." … "The petition for certiorari is
 * granted, the judgment … is reversed …" … "It is so ordered." Recorded
 * as summary_disposition when the closing sentence grants the petition and
 * reverses or vacates. Separate writings (statements, dissents from denial)
 * have no "PER CURIAM." line and are skipped.
 */
function parsePerCuriams(lines: string[]): ParsedAction[] {
  const out: ParsedAction[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^PER CURIAM\s*\.$/.test(lines[i].trim())) continue;
    let dockets: string[] = [];
    let decided: string | null = null;
    for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
      const m = lines[j].match(/Nos?\.\s+(.+?)\.\s+Decided\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
      if (m) {
        dockets = [...m[1].matchAll(/(\d{2})[–-](\d{1,5})/g)].map((x) => `${x[1]}-${x[2]}`);
        decided = isoDate(m[2], m[3], m[4]);
        break;
      }
    }
    const end = lines.findIndex((l, k) => k > i && /It is so ordered\./.test(l));
    if (!decided || dockets.length === 0 || end < 0) continue;
    const body = lines
      .slice(i + 1, end)
      .filter((l) => !/^\s*Cite as:/.test(l) && l.trim() !== "Per Curiam" && !/^\s*\d+\s*$/.test(l))
      .join("\n")
      .replace(/([a-z])-\s*\n\s*([a-z])/g, "$1$2");
    const last = body.lastIndexOf("The petition for");
    if (last < 0) continue;
    const closing = norm(body.slice(last));
    if (!/certiorari[^.]*(?:is|are)\s+granted/i.test(closing) || !/reversed|vacated/i.test(closing)) continue;
    const courtText = `${closing} It is so ordered.`;
    for (const n of dockets) out.push({ docketNumber: n, action: "summary_disposition", actionDate: decided, courtText });
  }
  return out;
}
