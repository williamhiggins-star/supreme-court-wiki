/**
 * backfill-key-exchange-attribution.ts
 *
 * key_exchanges has 333 rows across multiple terms, but advocate_id was
 * null on every single one -- the original dual-write dropped the
 * petitioner/respondent attribution that data/cases/*.json's
 * parties[].keyExchanges[] carries (and folded that entry's `context`
 * into `significance`, losing the distinction there too). This backfills
 * role + context back, scoped strictly to decided OT2025 rows -- other
 * terms' rows are left untouched (role/advocate_id/context stay null,
 * same as today).
 *
 * Matching: for each OT2025 key_exchanges row, find the JSON entry whose
 * `question` matches the row's `exchange` text VERBATIM (exact string
 * equality, not fuzzy) to recover its role + context. role is written
 * directly from that match -- it's the reliable, load-bearing party-
 * attribution signal. advocate_id is ALSO attempted (case_id +
 * role='argued_petitioner'/'argued_respondent' via case_participations)
 * but is best-effort supplementary metadata only: case_participations
 * coverage is incomplete (confirmed: 59 of the (case, role) pairs here
 * have no matching entry, including Trump v. Slaughter's own respondent
 * side), so nothing depends on it resolving. Rows whose exchange text
 * doesn't match verbatim are reported and left unmodified rather than
 * guessed at.
 *
 * Run:  npx tsx scripts/backfill-key-exchange-attribution.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { getCredentials } from "./lib/supabase-sync/env.js";
import { select, update } from "./lib/supabase-sync/client.js";

const CASES_DIR = path.join(process.cwd(), "data", "cases");

interface CaseRow {
  id: string;
  slug: string;
}
interface KeyExchangeRow {
  id: string;
  case_id: string;
  exchange: string;
}
interface ParticipationRow {
  case_id: string;
  role: string;
  person_id: string;
}
interface JsonKeyExchange {
  justice: string;
  question: string;
  context: string;
  significance: string;
}
interface JsonParty {
  role: "petitioner" | "respondent" | "amicus";
  keyExchanges?: JsonKeyExchange[];
}

const ROLE_TO_PARTICIPATION_ROLE: Record<string, string> = {
  petitioner: "argued_petitioner",
  respondent: "argued_respondent",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const cases = await select<CaseRow>(creds, "cases", "?term=eq.2025&status=eq.decided&select=id,slug");
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const caseIds = cases.map((c) => c.id);

  const keyExchanges = await select<KeyExchangeRow>(
    creds,
    "key_exchanges",
    `?case_id=in.(${caseIds.join(",")})&select=id,case_id,exchange`,
  );
  console.log(`Found ${keyExchanges.length} key_exchanges row(s) belonging to OT2025 cases.\n`);

  const participations = await select<ParticipationRow>(
    creds,
    "case_participations",
    `?case_id=in.(${caseIds.join(",")})&role=in.(argued_petitioner,argued_respondent)&select=case_id,role,person_id`,
  );
  const advocateByCaseRole = new Map<string, string>();
  for (const p of participations) {
    const key = `${p.case_id}::${p.role}`;
    if (!advocateByCaseRole.has(key)) advocateByCaseRole.set(key, p.person_id); // first advocate for that role, role is what matters here, not which specific advocate
  }

  let matched = 0;
  let advocateResolved = 0;
  const noParticipation: { slug: string; role: string; exchangeId: string }[] = [];
  const textMismatch: { slug: string; exchangeId: string; exchange: string }[] = [];

  const rowsByCaseId = new Map<string, KeyExchangeRow[]>();
  for (const kx of keyExchanges) {
    if (!rowsByCaseId.has(kx.case_id)) rowsByCaseId.set(kx.case_id, []);
    rowsByCaseId.get(kx.case_id)!.push(kx);
  }

  for (const [caseId, rows] of rowsByCaseId) {
    const c = caseById.get(caseId)!;
    const filePath = path.join(CASES_DIR, `${c.slug}.json`);
    if (!fs.existsSync(filePath)) {
      // Confirmed earlier this session: none of the 11 no-JSON cases have
      // any key_exchanges rows, so this shouldn't trigger -- guarded
      // anyway rather than assumed.
      for (const kx of rows) textMismatch.push({ slug: c.slug, exchangeId: kx.id, exchange: "(no JSON file for this case)" });
      continue;
    }
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { parties?: JsonParty[] };
    const questionMap = new Map<string, { role: string; context: string }>();
    for (const p of json.parties ?? []) {
      for (const ex of p.keyExchanges ?? []) {
        questionMap.set(ex.question, { role: p.role, context: ex.context });
      }
    }

    for (const kx of rows) {
      const found = questionMap.get(kx.exchange);
      if (!found) {
        textMismatch.push({ slug: c.slug, exchangeId: kx.id, exchange: kx.exchange.slice(0, 80) });
        continue;
      }
      matched++;

      const participationRole = ROLE_TO_PARTICIPATION_ROLE[found.role];
      const advocateId = participationRole ? advocateByCaseRole.get(`${caseId}::${participationRole}`) : undefined;

      // role is the primary, reliable party-attribution signal (from the
      // same JSON match as context) -- advocate_id is best-effort
      // supplementary metadata only, never required for correct
      // bucketing (case_participations coverage is incomplete; see the
      // 20260901060000 migration's own comment).
      const patch: Record<string, unknown> = { context: found.context, role: found.role };
      if (advocateId) {
        patch.advocate_id = advocateId;
        advocateResolved++;
      } else {
        noParticipation.push({ slug: c.slug, role: found.role, exchangeId: kx.id });
      }

      if (!dryRun) await update(creds, "key_exchanges", `id=eq.${kx.id}`, patch);
    }
  }

  console.log(`Matched (role + context backfilled): ${matched} / ${keyExchanges.length}`);
  console.log(`Of those, advocate_id also resolved (best-effort, non-load-bearing): ${advocateResolved}`);
  console.log(`\nNo case_participations entry for the resolved role (advocate_id left null; role + context still set correctly): ${noParticipation.length}`);
  for (const n of noParticipation) console.log(`  ${n.slug} (${n.role}): exchange ${n.exchangeId}`);
  console.log(`\nText mismatch (no update applied): ${textMismatch.length}`);
  for (const t of textMismatch) console.log(`  ${t.slug}: exchange ${t.exchangeId} -- "${t.exchange}"`);

  if (dryRun) console.log("\n--dry-run: no writes performed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
