/**
 * env.ts — credential loading for the outbound Supabase sync.
 *
 * Loads .env.local for local dev (same pattern as the other scripts), then
 * reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment.
 * These come from GitHub Secrets at runtime in the daily workflow.
 */

import * as fs from "fs";
import * as path from "path";

/** Load .env.local into process.env without overwriting existing values. */
export function loadEnvLocal(): void {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* rely on process.env */
  }
}

export interface SupabaseCredentials {
  url: string;
  serviceRoleKey: string;
}

/**
 * Returns credentials, or null when either is missing.
 * The caller decides whether a missing credential is fatal (backfill) or a
 * graceful skip (daily sync).
 */
export function getCredentials(): SupabaseCredentials | null {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}
