/**
 * Mixpanel event catalogue: names and property shapes, shared by the browser
 * and server wrappers so a call that leaves out (or misspells) a property fails
 * the type check. No SDK import here, so either side can use it.
 *
 * Rules (mixpanel tracking-implementation guide): snake_case names, one event
 * per user action, flat properties, numbers as numbers, nothing dynamic in a
 * name, and a property with no value is left out rather than sent as null or "".
 */

/** The project token. Public by design (it ships in every browser bundle); an env var overrides it per deployment. */
export const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "d87ceb24b5c4ac90aaddae5a8f6df97b";

/** Cookies the browser writes so the server can fill in what only the browser knows. */
export const SESSION_NUMBER_COOKIE = "kq_sn";
export const ANON_ID_COOKIE = "kq_did";

export type PlanTier = "free" | "pass" | "pro" | "vip";

export interface MixpanelEvents {
  /** Sign-up finished and the account is on the free tier. */
  user_signed_up: {
    signup_method: string;
    acquisition_channel: string;
    country: string;
    initial_tier: string;
  };
  /** A session started with a successful sign-in. */
  login_started: {
    login_method: string;
    country: string;
    current_tier: string;
    device_type: string;
  };
  /** Forge built a combo. */
  forge_combo_created: {
    match_count: number;
    combo_type: string;
    session_number: number;
    current_tier: string;
  };
  /** An Ask KiqStat question was answered. */
  ask_kiqstat_question_submitted: {
    question_topic: string;
    response_time_ms: number;
    current_tier: string;
    session_number: number;
  };
  /** A SportyBet booking code was generated from the user's combo. */
  code_hub_code_generated: {
    code_type: string;
    validation_mode: string;
    matches_in_payload: number;
    current_tier: string;
  };
  /** A pasted code was read and checked in Code Hub. */
  code_hub_validation_completed: {
    validation_result: string;
    error_count: number;
    matches_checked: number;
    current_tier: string;
  };
  /** A match page showed the model's prediction. */
  model_performance_viewed: {
    insight_type: string;
    accuracy_score_bucket: string;
    current_tier: string;
    region_league: string;
  };
  /** Checkout for Pro was opened. */
  upgrade_to_pro_started: {
    from_tier: string;
    payment_method: string;
    plan_period: string;
    country: string;
  };
  /** A VIP payment was confirmed and VIP access granted. */
  upgrade_to_vip_completed: {
    from_tier: string;
    payment_method: string;
    plan_period: string;
    /** ISO 8601 timestamp: Mixpanel reads it as a datetime. */
    vip_start_datetime: string;
  };
}

export type MixpanelEventName = keyof MixpanelEvents;

/**
 * Countries where analytics is held back until the app has a consent prompt:
 * the EU/EEA, the UK and Switzerland. Visitors from elsewhere are tracked.
 */
const CONSENT_FIRST = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
]);

export function needsConsent(country: string | null | undefined): boolean {
  return Boolean(country) && CONSENT_FIRST.has(String(country).toUpperCase());
}

/** high / medium / low from the model's 0-100 confidence on the displayed pick. */
export function accuracyBucket(confidence: number | null | undefined): string {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "unrated";
  if (confidence >= 70) return "high";
  if (confidence >= 50) return "medium";
  return "low";
}

/** Drops properties that have no value, as the guide asks. */
export function clean<T extends object>(props: T): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === "" || (typeof v === "number" && !Number.isFinite(v))) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** A coarse bucket for what a user said they asked about; the question text itself is never sent. */
export function questionTopic(text: string): string {
  const q = text.toLowerCase();
  if (/\b(odds?|price|value|bookie|bookmaker|payout|stake)\b/.test(q)) return "odds";
  if (/\b(form|injur|injury|suspend|lineup|line-up|starting|player|striker|goalkeeper|scorer)\b/.test(q)) return "player_form";
  if (/\b(tactic|formation|press|possession|style|set piece|corner|shots?)\b/.test(q)) return "tactics";
  if (/\b(predict|prediction|pick|tip|win|chance|likely|probab|score|btts|over|under|combo|slip|accumulator)\b/.test(q)) return "predictions";
  return "other";
}
