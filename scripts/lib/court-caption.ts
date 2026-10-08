/**
 * The Court's own caption for a docket, from the "Title:" field of its
 * docket page (/docket/docketfiles/html/public/{n}.html).
 *
 * One source for both case slugs (pipeline.ts) and party names
 * (sd-db/write.ts), so neither comes from LLM-written text.
 */

export interface CaptionParties {
  petitioner: string;
  respondent: string;
}

const CAPTION = /^(.*?),?\s+(?:Petitioners?|Applicants?|Appellants?|Plaintiffs?)\s+v\.\s+(.*)$/i;

/** Comma-separated segments that are part of a party's legal name, not a
 *  description of it ("Inc.", "LLC", "Jr."). */
const NAME_SUFFIX = /^(?:Inc\.?|L\.?L\.?C\.?|Ltd\.?|Corp\.?|Co\.?|L\.?P\.?|N\.A\.|P\.C\.|Jr\.?|Sr\.?|II|III|IV)$/i;

/** "Suncor Energy (U.S.A.) Inc., et al., Petitioners v. County
 *  Commissioners of Boulder County, et al." → { petitioner: "Suncor
 *  Energy (U.S.A.) Inc.", respondent: "County Commissioners of Boulder
 *  County" }. Each party is its name up to the first comma, plus any
 *  legal-name suffix that follows ("Eddie Grant, Jr.", "Sun Valley
 *  Orchards, LLC"); "et al.", offices, places and "fka"/"dba" are dropped.
 *  Null for titles without a "Petitioner(s) v." shape (e.g. "In re …"). */
export function courtCaptionParties(docketTitle: string): CaptionParties | null {
  const m = docketTitle.match(CAPTION);
  if (!m) return null;
  const partyName = (s: string) => {
    const [first, ...rest] = s.split(",").map((p) => p.trim());
    const suffixes = [];
    for (const seg of rest) {
      if (!NAME_SUFFIX.test(seg)) break;
      suffixes.push(seg);
    }
    return [first, ...suffixes].join(", ");
  };
  const petitioner = partyName(m[1]);
  const respondent = partyName(m[2]);
  if (!petitioner || !respondent) return null;
  return { petitioner, respondent };
}

/** "Suncor Energy (U.S.A.) Inc., et al., Petitioners v. County
 *  Commissioners of Boulder County, et al." → "Suncor Energy (U.S.A.) Inc.
 *  v. County Commissioners of Boulder County": each party up to its first
 *  comma (the slug rule). Titles without a "Petitioner(s) v." shape (e.g.
 *  "In re …") are returned whole. */
export function shortCourtCaption(docketTitle: string): string {
  const m = docketTitle.match(CAPTION);
  if (!m) return docketTitle;
  const firstParty = (s: string) => s.split(",")[0].trim();
  return `${firstParty(m[1])} v. ${firstParty(m[2])}`;
}

/** The full "Title:" field of a docket page, as plain text. */
export async function fetchCourtDocketTitle(caseNumber: string): Promise<string> {
  const url = `https://www.supremecourt.gov/docket/docketfiles/html/public/${caseNumber}.html`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SupremeCourtWiki/1.0; +https://github.com/supreme-court-wiki)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const title = parseDocketTitle(await res.text());
  if (!title) throw new Error(`No "Title:" field on docket page ${caseNumber}`);
  return title;
}

export function parseDocketTitle(html: string): string | null {
  const m = html.match(/Title:[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (!m) return null;
  return m[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
