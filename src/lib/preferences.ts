import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { leagueByCode } from "@/lib/leagues";
import { DEFAULT_SPORT, type SportId } from "@/lib/sports";

/** What onboarding asks, and what the rest of the app reads back. */
export type UsageIntent = "team" | "value" | "accas";
export type DigestChoice = "matchday" | "weekend" | "none";

export interface UserPreferences {
  leagues: string[];
  sports: SportId[];
  usageIntent: UsageIntent | null;
  digest: DigestChoice;
  lastStep: number | null;
  startedAt: string | null;
  onboardedAt: string | null;
}

/**
 * What a visitor with no row looks like. Returned for logged-out users and
 * for accounts created before onboarding existed, so callers never branch on
 * "is there a row" — only on `onboardedAt`, which is the question they
 * actually care about.
 */
export const NO_PREFERENCES: UserPreferences = {
  leagues: [],
  sports: [DEFAULT_SPORT],
  usageIntent: null,
  digest: "none",
  lastStep: null,
  startedAt: null,
  onboardedAt: null,
};

interface PreferencesRow {
  leagues: string[] | null;
  sports: string[] | null;
  usage_intent: UsageIntent | null;
  digest: DigestChoice | null;
  last_step: number | null;
  started_at: string | null;
  onboarded_at: string | null;
}

const COLUMNS = "leagues, sports, usage_intent, digest, last_step, started_at, onboarded_at";

function fromRow(row: PreferencesRow): UserPreferences {
  return {
    // A league code that has since been retired from the catalogue is dropped
    // rather than passed on: every consumer looks it up, and a dangling code
    // would show as an empty chip or silently skew the featured scorer.
    leagues: (row.leagues ?? []).filter((code) => leagueByCode(code) !== undefined),
    sports: (row.sports ?? [DEFAULT_SPORT]) as SportId[],
    usageIntent: row.usage_intent,
    digest: row.digest ?? "none",
    lastStep: row.last_step,
    startedAt: row.started_at,
    onboardedAt: row.onboarded_at,
  };
}

/** Preferences for the signed-in user, or NO_PREFERENCES for anyone else. */
export async function getPreferences(): Promise<UserPreferences> {
  if (!supabaseConfigured) return NO_PREFERENCES;

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NO_PREFERENCES;

    const { data } = await supabase
      .from("user_preferences")
      .select(COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle<PreferencesRow>();

    return data ? fromRow(data) : NO_PREFERENCES;
  } catch {
    // Preferences are a personalisation, never an authorization boundary —
    // failing to read them should degrade to the default experience, not
    // break the page.
    return NO_PREFERENCES;
  }
}

/** Same, for a caller that already resolved the user and holds a client. */
export async function getPreferencesFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPreferences> {
  try {
    const { data } = await supabase
      .from("user_preferences")
      .select(COLUMNS)
      .eq("user_id", userId)
      .maybeSingle<PreferencesRow>();
    return data ? fromRow(data) : NO_PREFERENCES;
  } catch {
    return NO_PREFERENCES;
  }
}

export function hasOnboarded(prefs: UserPreferences): boolean {
  return prefs.onboardedAt !== null;
}
