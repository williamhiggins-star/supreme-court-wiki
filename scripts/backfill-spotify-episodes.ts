/**
 * backfill-spotify-episodes.ts
 *
 * Matches every argued OT2025 case to its SCOTUS oral-arguments Spotify
 * podcast episode and writes the match to public.case_podcast_episodes.
 * Same matching approach as scripts/fetch-spotify-episodes.ts (which
 * writes podcastEpisodeUrl/spotifyMatchStatus to data/cases/*.json): match
 * by docket number parsed out of the episode description first (exact,
 * match_confidence 1.0), falling back to word-overlap title similarity for
 * episodes with no parseable docket (match_confidence = the computed
 * score, only accepted at >=0.5).
 *
 * Run:  npx tsx scripts/backfill-spotify-episodes.ts [--dry-run]
 */

import { getCredentials, loadEnvLocal } from "./lib/supabase-sync/env.js";
import { select, upsert } from "./lib/supabase-sync/client.js";

loadEnvLocal();

const SHOW_ID = "4MKC4K2XT2Kb3h2Sk43udD";

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
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
  let url: string | null = `https://api.spotify.com/v1/shows/${SHOW_ID}/episodes?limit=50&market=US`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Episodes fetch failed: ${res.status}`);
    const data = (await res.json()) as { items: SpotifyEpisode[]; next: string | null };
    episodes.push(...data.items);
    url = data.next;
  }
  return episodes;
}

// Episode descriptions follow a consistent "<Case Name> | <MM/DD/YY> |
// Docket #: <docket>" format.
const DOCKET_LABEL_REGEX = /Docket\s*#\s*:?\s*([0-9]{1,2}[A-Za-z]?-[0-9A-Za-z]{1,6})/i;

function normalizeDocket(docket: string): string {
  return docket
    .replace(/\s*\(consolidated.*$/i, "")
    .trim()
    .toUpperCase();
}

function extractDocketFromDescription(description: string | undefined): string | null {
  if (!description) return null;
  const m = description.match(DOCKET_LABEL_REGEX);
  return m ? normalizeDocket(m[1]) : null;
}

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

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "inc", "llc", "ltd", "corp", "vs", "v", "of", "in", "a",
]);

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function matchScore(caseTitle: string, episodeName: string): number {
  if (episodeName.toLowerCase().includes(caseTitle.toLowerCase())) return 1.0;
  const caseWords = titleWords(caseTitle);
  const epWords = new Set(titleWords(episodeName));
  if (caseWords.length === 0) return 0;
  const matches = caseWords.filter((w) => epWords.has(w)).length;
  return matches / caseWords.length;
}

function bestTitleMatch(caseTitle: string, candidates: SpotifyEpisode[]): { ep: SpotifyEpisode | null; score: number } {
  let bestScore = 0;
  let bestEp: SpotifyEpisode | null = null;
  for (const ep of candidates) {
    const score = matchScore(caseTitle, ep.name);
    if (score > bestScore) {
      bestScore = score;
      bestEp = ep;
    }
  }
  return { ep: bestEp, score: bestScore };
}

interface CaseRow {
  id: string;
  slug: string;
  caption: string;
  docket_number: string | null;
  sitting: string | null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET");

  const creds = getCredentials();
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  console.log("Fetching Spotify access token...");
  const token = await getAccessToken(clientId, clientSecret);

  console.log("Fetching podcast episodes...");
  const episodes = await fetchAllEpisodes(token);
  console.log(`${episodes.length} episodes found.`);

  const { byDocket, undocketed } = indexEpisodesByDocket(episodes);
  console.log(`${byDocket.size} episodes carry a parseable docket number, ${undocketed.length} do not.\n`);

  const cases = await select<CaseRow>(
    creds,
    "cases",
    "?term=eq.2025&status=eq.decided&select=id,slug,caption,docket_number,sitting",
  );
  const argued = cases.filter((c) => c.sitting !== "no_argument");
  console.log(`${cases.length} decided OT2025 cases: ${cases.length - argued.length} no_argument (skipped), ${argued.length} argued.\n`);

  let matchedByDocket = 0;
  let matchedByTitle = 0;
  const unmatched: { slug: string; caption: string; reason: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const c of argued) {
    const docket = c.docket_number ? normalizeDocket(c.docket_number) : null;
    const docketHit = docket ? byDocket.get(docket) : undefined;

    if (docketHit) {
      rows.push({
        case_id: c.id,
        episode_id: docketHit.id,
        episode_url: docketHit.external_urls.spotify,
        match_method: "docket",
        match_confidence: 1.0,
      });
      console.log(`✅ [docket] ${c.caption} (${docket}) → "${docketHit.name}"`);
      matchedByDocket++;
      continue;
    }

    const { ep: bestEp, score } = bestTitleMatch(c.caption, undocketed);
    if (bestEp && score >= 0.5) {
      rows.push({
        case_id: c.id,
        episode_id: bestEp.id,
        episode_url: bestEp.external_urls.spotify,
        match_method: "title",
        match_confidence: score,
      });
      console.log(`✅ [title]  ${c.caption} → "${bestEp.name}" (${(score * 100).toFixed(0)}%)`);
      matchedByTitle++;
      continue;
    }

    const reason = bestEp ? `below threshold (best: "${bestEp.name}", ${(score * 100).toFixed(0)}%)` : "no docket match, no title candidates";
    unmatched.push({ slug: c.slug, caption: c.caption, reason });
    console.log(`❌ ${c.caption} — ${reason}`);
  }

  console.log(`\n${matchedByDocket} matched by docket, ${matchedByTitle} matched by title, ${unmatched.length} unmatched (of ${argued.length} argued cases).`);
  if (unmatched.length) {
    console.log("\nUNMATCHED:");
    for (const u of unmatched) console.log(`  ${u.slug}: ${u.reason}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  if (rows.length) {
    await upsert(creds, "case_podcast_episodes", rows, "case_id");
  }
  console.log(`\n✓ Wrote ${rows.length} match(es) to case_podcast_episodes.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
