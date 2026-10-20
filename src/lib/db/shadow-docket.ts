/**
 * shadow-docket.ts — the public Emergency / Shadow Docket rows, for the
 * dashboard's Shadow Docket section.
 *
 * Reads public.emergency_shadow_docket_public with the anon key, like every
 * other accessor here. That view is the only public way into this data: it
 * returns only rows marked public_view and only the columns below
 * (migration 20261024000000). The underlying tables stay closed to visitors.
 */

import { db } from "./client";

export interface ShadowDocketRow {
  docketNumber: string; // "26A476"
  docketUrl: string; // the Court's docket page
  title: string; // the Court's caption
  applicationType: string | null; // glossary code, for the type filter
  applicationWording: string; // the Court's words: "for a stay"
  directedTo: string | null; // "Justice Kagan", "The Chief Justice"
  filedDate: string | null; // YYYY-MM-DD
  pending: boolean;
  outcome: string | null; // glossary code
  lowerCourt: string | null; // for search only
  lowerCourtCaseNumbers: string | null; // for search only
}

export async function getShadowDocketRows(): Promise<ShadowDocketRow[]> {
  const { data, error } = await db
    .from("emergency_shadow_docket_public")
    .select("*")
    .order("filed_date", { ascending: false, nullsFirst: false })
    .order("docket_number", { ascending: false });
  if (error) throw new Error(`getShadowDocketRows: ${error.message}`);
  return (data ?? []).map((r) => ({
    docketNumber: r.docket_number ?? "",
    docketUrl: r.docket_url ?? "",
    title: r.title ?? "",
    applicationType: r.application_type,
    applicationWording: r.application_wording ?? "",
    directedTo: r.directed_to,
    filedDate: r.filed_date,
    pending: r.pending ?? false,
    outcome: r.outcome,
    lowerCourt: r.lower_court,
    lowerCourtCaseNumbers: r.lower_court_case_numbers,
  }));
}
