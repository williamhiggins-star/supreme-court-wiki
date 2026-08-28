/**
 * fetch-spotify-episodes.ts
 *
 * Fetches all episodes from the SCOTUS oral arguments Spotify podcast and
 * matches them to case JSON files, primarily by docket number (parsed out
 * of the episode description) and falling back to title similarity for
 * episodes that don't carry a docket number. Writes podcastEpisodeUrl and
 * spotifyMatchStatus to case files.
 *
 * Run:       npx tsx scripts/fetch-spotify-episodes.ts
 * Dry run:   npx tsx scripts/fetch-spotify-episodes.ts --dry-run
 *            (computes and prints matches, writes nothing to data/cases/)
 * Requires: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local (or env)
 *
 * No dual-write (Phase 3, SUPABASE_PLAN.md): the SD schema has no
 * podcast_episode_url column on `cases`, and no other table stores a
 * per-case podcast link (publications.kind has a 'podcast_episode' value
 * reserved for a future law-review/podcast fetcher — see the plan's Phase
 * 6 — but nothing populates it today, and it's not the same relationship
 * as "this case's own transcript audio"). Confirmed via the schema, not
 * skipped by omission.
 */

import * as fs from "fs";
import * as path from "path";

// ── Load .env.local for local dev ─────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* rely on process.env */ }
}
loadEnvLocal();

// ── Constants ─────────────────────────────────────────────────────────────────

const SHOW_ID   = "4MKC4K2XT2Kb3h2Sk43udD";
const CASES_DIR = path.join(process.cwd(), "data", "cases");
const DRY_RUN   = process.argv.includes("--dry-run");

// How far back to look for a case to match against. Not tied to any
// specific term — a case argued within the window is a candidate every
// run; older cases are left alone (their status, if any, stays as-is)
// rather than searched on every run. ~2 terms of history covers normal
// carryover (e.g. a case argued in the fall of one term, decided the
// next) without unbounded growth as the archive ages.
const MATCH_WINDOW_MONTHS = 24;

// ── Spotify API ───────────────────────────────────────────────────────────────

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

interface SpotifyEpisode {
  id: string;
  name: string;
  description: string;
  external_urls: { spotify: string };
}

async function fetchAllEpisodes(token: string): Promise<SpotifyEpisode[]> {
  const episodes: SpotifyEpisode[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/shows/${SHOW_ID}/episodes?limit=50&market=US`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Episodes fetch failed: ${res.status}`);
    const data = await res.json() as { items: SpotifyEpisode[]; next: string | null };
    episodes.push(...data.items);
    url = data.next;
  }
  return episodes;
}

// ── Docket matching ───────────────────────────────────────────────────────────
//
// Episode descriptions follow a consistent "<Case Name> | <MM/DD/YY> |
// Docket #: <docket>" format (confirmed against the live show, e.g.
// "Free Speech Coalition v. Paxton | 01/15/25 | Docket #: 23-1122").
// Episodes that don't carry this label fall back to title matching below.

const DOCKET_LABEL_REGEX = /Docket\s*#\s*:?\s*([0-9]{1,2}[A-Za-z]?-[0-9A-Za-z]{1,6})/i;

function normalizeDocket(docket: string): string {
  return docket.trim().toUpperCase();
}

function extractDocketFromDescription(description: string | undefined): string | null {
  if (!description) return null;
  const m = description.match(DOCKET_LABEL_REGEX);
  return m ? normalizeDocket(m[1]) : null;
}

/** Splits episodes into a docket → episode index and the remainder with no parseable docket. */
function indexEpisodesByDocket(episodes: SpotifyEpisode[]): {
  byDocket: Map<string, SpotifyEpisode>;
  undocketed: SpotifyEpisode[];
} {
  const byDocket = new Map<string, SpotifyEpisode>();
  const undocketed: SpotifyEpisode[] = [];
  for (const ep of episodes) {
    const docket = extractDocketFromDescription(ep.description);
    if (docket) {
      if (!byDocket.has(docket)) byDocket.set(docket, ep);
    } else {
      undocketed.push(ep);
    }
  }
  return { byDocket, undocketed };
}

// ── Title matching (fallback only, for episodes with no parseable docket) ──────

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "inc", "llc", "ltd", "corp", "vs", "v", "of", "in", "a",
]);

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function matchScore(caseTitle: string, episodeName: string): number {
  // Exact substring match → perfect score
  if (episodeName.toLowerCase().includes(caseTitle.toLowerCase())) return 1.0;
  const caseWords = titleWords(caseTitle);
  const epWords   = new Set(titleWords(episodeName));
  if (caseWords.length === 0) return 0;
  const matches = caseWords.filter(w => epWords.has(w)).length;
  return matches / caseWords.length;
}

function bestTitleMatch(caseTitle: string, candidates: SpotifyEpisode[]): { ep: SpotifyEpisode | null; score: number } {
  let bestScore = 0;
  let bestEp: SpotifyEpisode | null = null;
  for (const ep of candidates) {
    const score = matchScore(caseTitle, ep.name);
    if (score > bestScore) { bestScore = score; bestEp = ep; }
  }
  return { ep: bestEp, score: bestScore };
}

function withinMatchWindow(argumentDate: string, now: Date): boolean {
  const argued = new Date(argumentDate);
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - MATCH_WINDOW_MONTHS);
  return argued >= cutoff;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET.");
    console.error("   Add them to .env.local (local) or GitHub Actions secrets (CI).");
    process.exit(1);
  }

  if (DRY_RUN) console.log("🧪 Dry run — no files will be written.\n");

  console.log("🎵 Fetching Spotify access token...");
  const token = await getAccessToken(clientId, clientSecret);

  console.log("🎙️  Fetching podcast episodes...");
  const episodes = await fetchAllEpisodes(token);
  console.log(`   ${episodes.length} episodes found.\n`);

  const { byDocket, undocketed } = indexEpisodesByDocket(episodes);
  console.log(`   ${byDocket.size} episodes carry a parseable docket number, ${undocketed.length} do not.\n`);

  const now       = new Date();
  const today     = now.toISOString().split("T")[0];
  const caseFiles = fs.readdirSync(CASES_DIR).filter(f => f.endsWith(".json"));

  let matchedByDocket = 0;
  let matchedByTitle  = 0;
  let alreadyMatched  = 0;
  const unmatched: { title: string; caseNumber: string; argumentDate: string; status: string }[] = [];

  for (const file of caseFiles) {
    const filePath = path.join(CASES_DIR, file);
    const c = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Already matched — leave alone, just backfill the status field if missing.
    if (c.podcastEpisodeUrl) {
      alreadyMatched++;
      if (c.spotifyMatchStatus !== "matched") {
        c.spotifyMatchStatus = "matched";
        if (!DRY_RUN) fs.writeFileSync(filePath, JSON.stringify(c, null, 2) + "\n");
      }
      continue;
    }

    // Not argued yet, or outside the lookback window — nothing to search for (yet).
    if (!c.argumentDate || c.argumentDate >= today || !withinMatchWindow(c.argumentDate, now)) {
      if (c.spotifyMatchStatus !== "not_searched") {
        c.spotifyMatchStatus = "not_searched";
        if (!DRY_RUN) fs.writeFileSync(filePath, JSON.stringify(c, null, 2) + "\n");
      }
      continue;
    }

    const caseDocket = c.caseNumber ? normalizeDocket(c.caseNumber) : null;
    const docketHit = caseDocket ? byDocket.get(caseDocket) : undefined;

    if (docketHit) {
      c.podcastEpisodeUrl = docketHit.external_urls.spotify;
      c.spotifyMatchStatus = "matched";
      if (!DRY_RUN) fs.writeFileSync(filePath, JSON.stringify(c, null, 2) + "\n");
      console.log(`✅ [docket] ${c.title} (${caseDocket})`);
      console.log(`   → "${docketHit.name}"`);
      matchedByDocket++;
      continue;
    }

    // Fall back to title matching, restricted to episodes with no parseable
    // docket number — episodes that do carry a docket already belong to
    // whichever case has that docket, so they're not eligible here.
    const { ep: bestEp, score: bestScore } = bestTitleMatch(c.title as string, undocketed);

    if (bestEp && bestScore >= 0.5) {
      c.podcastEpisodeUrl = bestEp.external_urls.spotify;
      c.spotifyMatchStatus = "matched";
      if (!DRY_RUN) fs.writeFileSync(filePath, JSON.stringify(c, null, 2) + "\n");
      console.log(`✅ [title]  ${c.title}`);
      console.log(`   → "${bestEp.name}"  (${(bestScore * 100).toFixed(0)}% match)`);
      matchedByTitle++;
      continue;
    }

    const status = bestEp ? "below_threshold" : "no_docket_found";
    c.spotifyMatchStatus = status;
    if (!DRY_RUN) fs.writeFileSync(filePath, JSON.stringify(c, null, 2) + "\n");
    unmatched.push({ title: c.title, caseNumber: c.caseNumber, argumentDate: c.argumentDate, status });
    if (bestEp) {
      console.log(`❌ ${c.title}`);
      console.log(`   best: "${bestEp.name}"  (${(bestScore * 100).toFixed(0)}% — below threshold)`);
    } else {
      console.log(`❌ ${c.title} — no docket match, no title candidates`);
    }
  }

  console.log(`\n✔ Done${DRY_RUN ? " (dry run, nothing written)" : ""}.`);
  console.log(`   ${matchedByDocket} newly matched by docket number.`);
  console.log(`   ${matchedByTitle} newly matched by title fallback.`);
  console.log(`   ${alreadyMatched} already had episode URLs.`);
  if (unmatched.length) {
    console.log(`   ${unmatched.length} still unmatched:`);
    for (const u of unmatched) {
      console.log(`     - [${u.status}] ${u.title} (${u.caseNumber}, argued ${u.argumentDate})`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
