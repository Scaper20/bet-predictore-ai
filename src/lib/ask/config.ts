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
 *   ASK_GUARD                  off | observe | enforce (enforce): whether the
 *                              money controls below block, or only record
 *                              what they would have blocked. Anything but an
 *                              explicit "observe" or "off" enforces.
 *   ASK_REQUEST_CEILING_USD    most one question may cost (0.02)
 *   ASK_DAILY_CAP_USD_<TIER>   most one account (or browser) may spend a day,
 *                              per plan: GUEST FREE PRO VIP (monthly price)
 *   ASK_DAILY_CAP_USD_<TIER>_<CYCLE>
 *                              the same for a plan paid QUARTERLY or YEARLY,
 *                              whose day is worth less
 *   ASK_PASS_CAP_USD           most one pass may spend over its whole window,
 *                              when its offer sets none (else PASS_CAP_SHARE
 *                              of the price paid)
 *   ASK_DAILY_BUDGET_USD       most all of Ask may spend a day (5)
 *   ASK_PASS_DAILY             questions per 24 hours of a pass, counted over
 *                              the whole pass (30)
 *   ASK_ALERT_EMAIL            where alerts go (SUPPORT_INBOX_EMAIL)
 *   ANTHROPIC_ASK_API_KEY      a key used only by Ask, so its spend shows on
 *                              its own in Anthropic's console (falls back to
 *                              ANTHROPIC_API_KEY)
 */

export type AskEffort = "low" | "medium" | "high";
export type GuardMode = "off" | "observe" | "enforce";
export type AskPlan = "guest" | "free" | "pro" | "vip" | "pass";
export type AskCycle = "monthly" | "quarterly" | "yearly";

export interface AskConfig {
  model: string;
  maxTokens: number;
  maxRounds: number;
  effort: AskEffort;
  guard: GuardMode;
  requestCeilingMicros: number;
  dailyCapMicros: Record<AskPlan, number>;
  /** Day caps for Pro and VIP by the billing cycle paid; monthly equals dailyCapMicros. */
  cycleCapMicros: Record<"pro" | "vip", Record<AskCycle, number>>;
  /** A pass's whole-window cap when its offer sets none; null = PASS_CAP_SHARE of the price. */
  passCapMicros: number | null;
  dailyBudgetMicros: number;
  /** Questions per 24 hours of a pass, counted over the whole pass. */
  passDaily: number;
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

/**
 * A quarterly or yearly plan earns less per day than monthly, so its day cap
 * is lower: each keeps a 30% contribution margin at ₦1,600 to the dollar with
 * every day used to the cap (docs/reports/ask-kiqstat-staging-margin.pdf).
 */
export const DEFAULT_CYCLE_CAP_USD: Record<"pro" | "vip", Record<AskCycle, number>> = {
  pro: { monthly: 0.04, quarterly: 0.04, yearly: 0.035 },
  vip: { monthly: 0.1, quarterly: 0.09, yearly: 0.08 },
};

/** Share of a pass's price, in dollars, that its Ask spend may reach when its offer sets no cap: $0.14 on a ₦500 pass. */
export const PASS_CAP_SHARE = 0.448;
export const NAIRA_PER_USD = 1600;

/** The most a pass may spend over its whole window, in micro-dollars. */
export function passCapMicros(config: AskConfig, offerCapUsd: number | null, paidKobo: number): number {
  if (offerCapUsd !== null && Number.isFinite(offerCapUsd) && offerCapUsd >= 0) return usd(offerCapUsd);
  if (config.passCapMicros !== null) return config.passCapMicros;
  return usd(((paidKobo / 100) / NAIRA_PER_USD) * PASS_CAP_SHARE);
}

/** Questions a pass allows over its whole window: ASK_PASS_DAILY per 24 hours, rounded up. */
export function passQuestions(config: AskConfig, hours: number): number {
  return Math.max(1, Math.ceil((config.passDaily * Math.max(1, hours)) / 24));
}

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
    guard: guardRaw === "off" || guardRaw === "observe" ? guardRaw : "enforce",
    requestCeilingMicros: money(env.ASK_REQUEST_CEILING_USD, 0.02),
    dailyCapMicros: {
      guest: money(env.ASK_DAILY_CAP_USD_GUEST, DEFAULT_DAILY_CAP_USD.guest),
      free: money(env.ASK_DAILY_CAP_USD_FREE, DEFAULT_DAILY_CAP_USD.free),
      pro: money(env.ASK_DAILY_CAP_USD_PRO, DEFAULT_DAILY_CAP_USD.pro),
      vip: money(env.ASK_DAILY_CAP_USD_VIP, DEFAULT_DAILY_CAP_USD.vip),
      pass: money(env.ASK_DAILY_CAP_USD_PASS, DEFAULT_DAILY_CAP_USD.pass),
    },
    cycleCapMicros: {
      pro: {
        monthly: money(env.ASK_DAILY_CAP_USD_PRO, DEFAULT_CYCLE_CAP_USD.pro.monthly),
        quarterly: money(env.ASK_DAILY_CAP_USD_PRO_QUARTERLY, DEFAULT_CYCLE_CAP_USD.pro.quarterly),
        yearly: money(env.ASK_DAILY_CAP_USD_PRO_YEARLY, DEFAULT_CYCLE_CAP_USD.pro.yearly),
      },
      vip: {
        monthly: money(env.ASK_DAILY_CAP_USD_VIP, DEFAULT_CYCLE_CAP_USD.vip.monthly),
        quarterly: money(env.ASK_DAILY_CAP_USD_VIP_QUARTERLY, DEFAULT_CYCLE_CAP_USD.vip.quarterly),
        yearly: money(env.ASK_DAILY_CAP_USD_VIP_YEARLY, DEFAULT_CYCLE_CAP_USD.vip.yearly),
      },
    },
    passCapMicros: env.ASK_PASS_CAP_USD?.trim() ? money(env.ASK_PASS_CAP_USD, 0.14) : null,
    dailyBudgetMicros: money(env.ASK_DAILY_BUDGET_USD, 5),
    passDaily: int(env.ASK_PASS_DAILY, 30, 1, 1000),
    label: `${base.model.replace(/^claude-/, "")}/${base.maxTokens}/${base.maxRounds}/${base.effort}`,
  };
}

/** The billing cycle a payment's plan names ("vip:yearly", "pro:quarterly:once"), or monthly. */
export function cycleOfPlan(plan: string | null | undefined): AskCycle {
  const cycle = plan?.split(":")[1];
  return cycle === "quarterly" || cycle === "yearly" ? cycle : "monthly";
}

/** The Lagos calendar date of an instant, as ask_spend books days (YYYY-MM-DD). */
export function lagosDay(at: Date | string): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}
