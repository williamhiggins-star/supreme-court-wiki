/**
 * backfill-petitioner-respondent.ts
 *
 * Populates cases.petitioner_name/petitioner_argument/
 * petitioner_supporting_points (and the respondent_* equivalents) from
 * data/cases/*.json's `parties` field, for every decided OT2025 case that
 * has a JSON file. The 11 cases backfilled straight to the DB in an
 * earlier session (Clark v. Sweeney, Margolin, etc.) have no JSON file
 * and no petitioner/respondent data was ever captured for them from any
 * source -- reported as gaps, not guessed at.
 *
 * Run:  npx tsx scripts/backfill-petitioner-respondent.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, update } from "./lib/supabase-sync/client.js";

const CASES_DIR = path.join(process.cwd(), "data", "cases");

interface JsonParty {
  party: string;
  role: "petitioner" | "respondent" | "amicus";
  coreArgument: string;
  supportingPoints: string[];
}

interface CaseRow {
  id: string;
  slug: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const cases = await select<CaseRow>(creds, "cases", "?term=eq.2025&status=eq.decided&select=id,slug");

  let populated = 0;
  const noJsonFile: string[] = [];
  const noPartiesInJson: string[] = [];

  for (const c of cases) {
    const filePath = path.join(CASES_DIR, `${c.slug}.json`);
    if (!fs.existsSync(filePath)) {
      noJsonFile.push(c.slug);
      continue;
    }
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { parties?: JsonParty[] };
    const petitioner = json.parties?.find((p) => p.role === "petitioner");
    const respondent = json.parties?.find((p) => p.role === "respondent");
    if (!petitioner && !respondent) {
      noPartiesInJson.push(c.slug);
      continue;
    }

    const patch = {
      petitioner_name: petitioner?.party ?? null,
      petitioner_argument: petitioner?.coreArgument ?? null,
      petitioner_supporting_points: petitioner?.supportingPoints ?? [],
      respondent_name: respondent?.party ?? null,
      respondent_argument: respondent?.coreArgument ?? null,
      respondent_supporting_points: respondent?.supportingPoints ?? [],
    };

    console.log(`${dryRun ? "[dry-run] " : ""}${c.slug}: petitioner="${petitioner?.party}" respondent="${respondent?.party}"`);
    if (!dryRun) await update(creds, "cases", `id=eq.${c.id}`, patch);
    populated++;
  }

  console.log(`\n${populated}/${cases.length} cases populated.`);
  if (noJsonFile.length) {
    console.log(`\n${noJsonFile.length} case(s) have no JSON file (no petitioner/respondent data ever captured for these -- needs fresh sourcing):`);
    for (const s of noJsonFile) console.log(`  ${s}`);
  }
  if (noPartiesInJson.length) {
    console.log(`\n${noPartiesInJson.length} case(s) have a JSON file but no parties data in it:`);
    for (const s of noPartiesInJson) console.log(`  ${s}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
