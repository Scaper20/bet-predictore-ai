/**
 * Ask KiqStat's knobs: model, output ceiling, calls per question, effort,
 * and the money controls. Every default is how production runs today; a
 * different value is set per environment (a preview or the Ask lab) to test
 * it before anyone changes production. Pure apart from reading env, so the
 * parsing is tested.
 *
 *   ASK_MODEL                  model id (claude-haiku-5-5)
 *   ASK_MAX_TOKENS             output ceiling per model call (8000)
 *   ASK_MAX_ROUNDS             model calls per question (6)
 *   ASK_EFFORT                 low | medium | high (medium)
 *   ASK_GUARD                  off | observe | enforce (observe): whether the
 *                              money controls below block, or only record
 *                              what they would have blocked
 *   ASK_REQUEST_CEILING_USD    most one question may cost (0.02)
 *   ASK_DAILY_CAP_USD_<TIER>   most one account (or browser) may spend a day,
 *                              per plan: GUEST FREE PRO VIP PASS
 *   ASK_DAILY_BUDGET_USD       most all of Ask may spend a day (5)
 *   ASK_PASS_DAILY             questions a day on a pass (unset: the pass's
 *                              plan's own allowance, as today)
 *   ASK_ALERT_EMAIL            where alerts go (SUPPORT_INBOX_EMAIL)
 *   ANTHROPIC_ASK_API_KEY      a key used only by Ask, so its spend shows on
 *                              its own in Anthropic's console (falls back to
 *                              ANTHROPIC_API_KEY)
 */

export type AskEffort = "low" | "medium" | "high";
export type GuardMode = "off" | "observe" | "enforce";
export type AskPlan = "guest" | "free" | "pro" | "vip" | "pass";

export interface AskConfig {
  model: string;
  maxTokens: number;
  maxRounds: number;
  effort: AskEffort;
  guard: GuardMode;
  requestCeilingMicros: number;
  dailyCapMicros: Record<AskPlan, number>;
  dailyBudgetMicros: number;
  /** Questions a day on a pass, or null for the plan's own allowance. */
  passDaily: number | null;
  /** Names the settings in logs and the lab: "haiku-5-5/8000/6/medium". */
  label: string;
}

const usd = (v: number) => Math.round(v * 1_000_000);

/**
 * Default daily caps per account, in US dollars: about 40% of what each plan
 * brings in per day (Pro ₦5,000 and VIP ₦12,000 a month, a pass ₦500 for its
 * day, at ₦1,600 to the dollar), so even an account at its cap every day
 * leaves the rest as margin. Free and guests get a small fixed amount.
 */
export const DEFAULT_DAILY_CAP_USD: Record<AskPlan, number> = {
  guest: 0.005,
  free: 0.01,
  pro: 0.04,
  vip: 0.1,
  pass: 0.12,
};

function int(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
}

function money(v: string | undefined, def: number): number {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? usd(n) : usd(def);
}

export function askConfig(env: Record<string, string | undefined> = process.env, overrides: Partial<Pick<AskConfig, "maxTokens" | "maxRounds" | "effort" | "model">> = {}): AskConfig {
  const effortRaw = env.ASK_EFFORT;
  const guardRaw = env.ASK_GUARD;
  const base = {
    model: env.ASK_MODEL?.trim() || "claude-haiku-5-5",
    maxTokens: int(env.ASK_MAX_TOKENS, 8000, 256, 32_000),
    maxRounds: int(env.ASK_MAX_ROUNDS, 6, 1, 10),
    effort: (effortRaw === "low" || effortRaw === "high" ? effortRaw : "medium") as AskEffort,
    ...overrides,
  };
  return {
    ...base,
    guard: guardRaw === "off" || guardRaw === "enforce" ? guardRaw : "observe",
    requestCeilingMicros: money(env.ASK_REQUEST_CEILING_USD, 0.02),
    dailyCapMicros: {
      guest: money(env.ASK_DAILY_CAP_USD_GUEST, DEFAULT_DAILY_CAP_USD.guest),
      free: money(env.ASK_DAILY_CAP_USD_FREE, DEFAULT_DAILY_CAP_USD.free),
      pro: money(env.ASK_DAILY_CAP_USD_PRO, DEFAULT_DAILY_CAP_USD.pro),
      vip: money(env.ASK_DAILY_CAP_USD_VIP, DEFAULT_DAILY_CAP_USD.vip),
      pass: money(env.ASK_DAILY_CAP_USD_PASS, DEFAULT_DAILY_CAP_USD.pass),
    },
    dailyBudgetMicros: money(env.ASK_DAILY_BUDGET_USD, 5),
    passDaily: env.ASK_PASS_DAILY?.trim() ? int(env.ASK_PASS_DAILY, 30, 1, 1000) : null,
    label: `${base.model.replace(/^claude-/, "")}/${base.maxTokens}/${base.maxRounds}/${base.effort}`,
  };
}
