/**
 * client.ts — typed Supabase client for scotusdashboard2's server-side
 * data layer.
 *
 * Server-only: every accessor in src/lib/db/ runs in a Server Component or
 * generateStaticParams, the same place src/lib/data.ts's fs.readFileSync
 * calls already run. Uses the ANON key (public, RLS-scoped to the
 * "public read access" policies every content table already has) — the
 * service-role key lives only in scripts/ and must never ship in app code.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase/database";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY. Set them in .env.local (local) " +
      "or the deployment environment. Only the anon/publishable key belongs here — " +
      "never SUPABASE_SERVICE_ROLE_KEY.",
  );
}

export const db = createClient<Database>(url, anonKey, {
  auth: { persistSession: false },
});
