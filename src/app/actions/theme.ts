"use server";

import { cookies } from "next/headers";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

/**
 * Persists the theme choice. The cookie is what actually drives rendering
 * (see theme-toggle.tsx / layout.tsx's beforeInteractive script) and works
 * for anonymous visitors with no Supabase involved. For a signed-in user it
 * additionally upserts `profiles.theme_preference`, so the choice follows
 * them to another device/browser — the cookie stays the source of truth for
 * "what to paint right now," the profile row is only for cross-device sync.
 */
export async function setTheme(theme: "light" | "dark") {
  const cookieStore = await cookies();
  cookieStore.set("theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  if (!supabaseConfigured) return;

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ theme_preference: theme }).eq("id", user.id);
    }
  } catch {
    // Cookie already set — cross-device sync is a nice-to-have, not required for this to work.
  }
}
