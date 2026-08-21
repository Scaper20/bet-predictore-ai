import "server-only";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Anonymous, cookie-free Supabase client for public server-side reads.
 *
 * `supabaseServer()` calls `cookies()`, which forces the whole route dynamic
 * (see the theme-cookie note in app/layout.tsx) — the right trade-off for
 * account pages, wrong for a public page like Track Record that has no
 * per-user data and should stay ISR-cached. This talks to Supabase with the
 * same RLS-respecting anon key but never touches the request's cookies.
 *
 * Returns null when unconfigured rather than throwing, matching the rest of
 * the app's "Supabase is optional" posture.
 */
export function supabasePublic() {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
