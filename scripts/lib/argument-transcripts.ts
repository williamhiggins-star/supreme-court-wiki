/**
 * The Court's oral-argument transcript listing for a term.
 *
 * Listing page: /oral_arguments/argument_transcript/{term} (singular). The
 * plural path the pipeline used before, /argument_transcripts/{term}, is a
 * 404 — every nightly run found zero transcripts from at least August 2026
 * until this fix. Each row links its transcript PDF with a relative,
 * single-quoted href and the docket number as the link text:
 *
 *   <a href='../argument_transcripts/2026/25-170_8m58.pdf' Target='_blank'>25-170</a>
 *
 * Fixtures: scripts/fixtures/argument-transcript-{2025,2026}.html.
 * Test:     npx tsx scripts/test-transcript-list.ts
 */

export interface TranscriptEntry {
  caseNumber: string;
  transcriptUrl: string;
}

export function transcriptListUrl(termYear: string): string {
  return `https://www.supremecourt.gov/oral_arguments/argument_transcript/${termYear}`;
}

/** One entry per docket number, first link wins; hrefs are resolved
 *  against the listing page's own URL. */
export function parseTranscriptList(html: string, pageUrl: string): TranscriptEntry[] {
  // The docket number is the PDF filename up to its "_" suffix.
  const pattern =
    /href\s*=\s*["']([^"']*argument_transcripts\/\d{4}\/([^"'_/]+)[^"']*\.pdf)["']/gi;
  const seen = new Set<string>();
  const results: TranscriptEntry[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    // Filenames are lowercase ("25a312"); the Court writes "25A312".
    const caseNumber = match[2].toUpperCase();
    if (seen.has(caseNumber)) continue;
    seen.add(caseNumber);
    results.push({ caseNumber, transcriptUrl: new URL(match[1], pageUrl).href });
  }
  return results;
}
