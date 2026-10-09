/**
 * test-party-sections.ts
 *
 * Guardrail test for the Petitioner/Respondent section columns
 * (partyFieldsFill in scripts/lib/sd-db/write.ts) and the Court-caption
 * party names they use (scripts/lib/court-caption.ts): names come from the
 * Court's caption, OT2026 on only, blanks only, nothing overwritten; the
 * slug caption is unchanged.
 *
 * Run:  npx tsx scripts/test-party-sections.ts
 */

import assert from "node:assert/strict";
import { courtCaptionParties, shortCourtCaption } from "./lib/court-caption.js";
import { partyFieldsFill, needsCaptionParties, type StoredPartyFields } from "./lib/sd-db/write.js";
import type { CaseSummary } from "../src/types/index.js";

let passed = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

// Docket-page "Title:" fields, verbatim from supremecourt.gov (Oct 2026).
const TITLES = {
  "25-170": "Suncor Energy (U.S.A.) Inc., et al., Petitioners v. County Commissioners of Boulder County, et al.",
  "25-842": "Tamer S. Wassily, et al., Petitioners v. Todd Blanche, Attorney General",
  "25-566": "Eddie Grant, Jr., et al., Petitioners v. Ronnell Higgins, in His Official Capacity as Commissioner of the Connecticut Department of Emergency Services and Public Transportation, et al.",
  "25-966": "Department of Labor, et al., Petitioners v. Sun Valley Orchards, LLC",
  "25-579": "Department of the Air Force, et al., Petitioners v. Prutehi Guahan, fka Prutehi Litekyan",
  "25-1003": "Eric Guerrero, Director, Texas Department of Criminal Justice, Correctional Institutions Division, Petitioner v. Dexter Johnson",
};

const empty: StoredPartyFields = {
  petitioner_name: null,
  respondent_name: null,
  petitioner_argument: null,
  respondent_argument: null,
  petitioner_supporting_points: [],
  respondent_supporting_points: [],
};
const parties: CaseSummary["parties"] = [
  { party: "LLM Petitioner (Petitioners)", role: "petitioner", coreArgument: "P arg", supportingPoints: ["p1", "p2"], keyExchanges: [] },
  { party: "LLM Respondent", role: "respondent", coreArgument: "R arg", supportingPoints: ["r1"], keyExchanges: [] },
];
const caption = { petitioner: "Tamer S. Wassily", respondent: "Todd Blanche" };

console.log("Court caption party names");

check("names drop et al., offices, places and fka", () => {
  assert.deepEqual(courtCaptionParties(TITLES["25-170"]), { petitioner: "Suncor Energy (U.S.A.) Inc.", respondent: "County Commissioners of Boulder County" });
  assert.deepEqual(courtCaptionParties(TITLES["25-842"]), { petitioner: "Tamer S. Wassily", respondent: "Todd Blanche" });
  assert.deepEqual(courtCaptionParties(TITLES["25-579"]), { petitioner: "Department of the Air Force", respondent: "Prutehi Guahan" });
  assert.deepEqual(courtCaptionParties(TITLES["25-1003"]), { petitioner: "Eric Guerrero", respondent: "Dexter Johnson" });
});

check("names keep legal-name suffixes (Jr., LLC)", () => {
  assert.equal(courtCaptionParties(TITLES["25-566"])?.petitioner, "Eddie Grant, Jr.");
  assert.equal(courtCaptionParties(TITLES["25-966"])?.respondent, "Sun Valley Orchards, LLC");
});

check("no Petitioner v. shape → no names", () => {
  assert.equal(courtCaptionParties("In re Smith"), null);
});

check("slug caption unchanged (first comma, as B1 set it)", () => {
  assert.equal(shortCourtCaption(TITLES["25-566"]), "Eddie Grant v. Ronnell Higgins");
  assert.equal(shortCourtCaption(TITLES["25-966"]), "Department of Labor v. Sun Valley Orchards");
  assert.equal(shortCourtCaption("In re Smith"), "In re Smith");
});

console.log("Petitioner/Respondent section fill");

check("OT2026 blank case: names from the caption, argument and points from the case data", () => {
  assert.deepEqual(partyFieldsFill(empty, caption, parties, "2026"), {
    petitioner_name: "Tamer S. Wassily",
    petitioner_argument: "P arg",
    petitioner_supporting_points: ["p1", "p2"],
    respondent_name: "Todd Blanche",
    respondent_argument: "R arg",
    respondent_supporting_points: ["r1"],
  });
});

check("never uses the LLM party name", () => {
  const patch = partyFieldsFill(empty, null, parties, "2026");
  assert.equal(patch.petitioner_name, undefined);
  assert.equal(patch.respondent_name, undefined);
});

check("OT2026 case with every value set keeps them all after a re-sync", () => {
  const full: StoredPartyFields = {
    petitioner_name: "Kept P",
    respondent_name: "Kept R",
    petitioner_argument: "kept",
    respondent_argument: "kept",
    petitioner_supporting_points: ["kept"],
    respondent_supporting_points: ["kept"],
  };
  assert.deepEqual(partyFieldsFill(full, caption, parties, "2026"), {});
  assert.equal(needsCaptionParties(full, "2026"), false);
});

check("only the blank columns are filled", () => {
  const patch = partyFieldsFill({ ...empty, petitioner_name: "Kept", respondent_argument: "kept" }, caption, parties, "2026");
  assert.deepEqual(Object.keys(patch).sort(), [
    "petitioner_argument", "petitioner_supporting_points", "respondent_name", "respondent_supporting_points",
  ]);
});

check("OT2025 and earlier: nothing filled, no Court fetch", () => {
  assert.deepEqual(partyFieldsFill(empty, caption, parties, "2025"), {});
  assert.equal(needsCaptionParties(empty, "2025"), false);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
