/**
 * fetch-spotify-episodes.ts
 *
 * Fetches all episodes from the SCOTUS oral arguments Spotify podcast and
 * matches them to case JSON files by title similarity. Writes podcastEpisodeUrl
 * to matching case files.
 *
 * Run: npx tsx scripts/fetch-spotify-episodes.ts
 * Requires: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local (or env)
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

// ── Title matching ────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET.");
    console.error("   Add them to .env.local (local) or GitHub Actions secrets (CI).");
    process.exit(1);
  }

  console.log("🎵 Fetching Spotify access token...");
  const token = await getAccessToken(clientId, clientSecret);

  console.log("🎙️  Fetching podcast episodes...");
  const episodes = await fetchAllEpisodes(token);
  console.log(`   ${episodes.length} episodes found.\n`);

  const today      = new Date().toISOString().split("T")[0];
  const caseFiles  = fs.readdirSync(CASES_DIR).filter(f => f.endsWith(".json"));

  let matched = 0;
  let skipped = 0;

  for (const file of caseFiles) {
    const filePath = path.join(CASES_DIR, file);
    const c = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Skip if already matched
    if (c.podcastEpisodeUrl) { skipped++; continue; }

    // Only match current term (2025) cases that have been argued
    if (c.termYear !== "2025") continue;
    if (!c.argumentDate || c.argumentDate >= today) continue;

    let bestScore = 0;
    let bestEp: SpotifyEpisode | null = null;

    for (const ep of episodes) {
      const score = matchScore(c.title as string, ep.name);
      if (score > bestScore) { bestScore = score; bestEp = ep; }
    }

    if (bestEp && bestScore >= 0.5) {
      c.podcastEpisodeUrl = bestEp.external_urls.spotify;
      fs.writeFileSync(filePath, JSON.stringify(c, null, 2) + "\n");
      console.log(`✅ ${c.title}`);
      console.log(`   → "${bestEp.name}"  (${(bestScore * 100).toFixed(0)}% match)`);
      matched++;
    } else if (bestEp) {
      console.log(`❌ ${c.title}`);
      console.log(`   best: "${bestEp.name}"  (${(bestScore * 100).toFixed(0)}% — below threshold)`);
    }
  }

  console.log(`\n✔ Done. ${matched} new cases matched. ${skipped} already had episode URLs.`);
}

main().catch(err => { console.error(err); process.exit(1); });
