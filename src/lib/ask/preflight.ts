import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { askApiKey } from "@/lib/ai/enabled";
import { ASK_PAUSED } from "@/lib/ask/status";
import { askConfig, lagosDay, type AskConfig } from "@/lib/ask/config";

/**
 * What has to be true before Ask KiqStat answers again, checked where it
 * runs (the admin Ask lab shows it). Reads settings and the database only;
 * it never calls Anthropic and spends nothing. The activation steps it
 * mirrors are in docs/ask-activation.md.
 */

export type CheckState = "ok" | "warn" | "fail";
export interface PreflightCheck {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

export interface PreflightInput {
  paused: boolean;
  config: AskConfig;
  hasKey: boolean;
  hasOwnKey: boolean;
  alertTo: string | null;
  canEmail: boolean;
  books: boolean;
  passWindow: boolean;
  offerCaps: boolean;
}

const usd = (m: number) => `$${(m / 1_000_000).toFixed(3)}`;

/** The checks, from facts already gathered. Pure, so the rules are tested. */
export function preflightChecks(i: PreflightInput): PreflightCheck[] {
  const c = i.config;
  return [
    {
      id: "guard",
      label: "Money guard enforces",
      state: c.guard === "enforce" ? "ok" : "fail",
      detail: c.guard === "enforce" ? "Caps stop questions; a broken meter refuses them." : `ASK_GUARD is "${c.guard}": caps would not stop spending. Remove it or set enforce.`,
    },
    {
      id: "books",
      label: "Spending books reachable (0088)",
      state: i.books ? "ok" : "fail",
      detail: i.books ? "ask_spend and its functions answer." : "The books can't be reached: an enforcing guard refuses every question.",
    },
    {
      id: "pass",
      label: "Pass ceilings in place (0089)",
      state: i.passWindow && i.offerCaps ? "ok" : "fail",
      detail:
        i.passWindow && i.offerCaps
          ? "Passes book to one bucket for their whole window, at their offer's cap."
          : "Apply migration 0089: without it every pass holder's question is refused.",
    },
    {
      id: "caps",
      label: "Caps and budget set",
      state: c.dailyBudgetMicros > 0 && c.requestCeilingMicros > 0 && c.requestCeilingMicros <= c.dailyBudgetMicros ? "ok" : "fail",
      detail: `Daily budget ${usd(c.dailyBudgetMicros)} · per question ${usd(c.requestCeilingMicros)} · Pro ${usd(c.cycleCapMicros.pro.monthly)}/${usd(c.cycleCapMicros.pro.yearly)} a day (monthly/yearly) · VIP ${usd(c.cycleCapMicros.vip.monthly)}/${usd(c.cycleCapMicros.vip.yearly)} · pass ${c.passDaily} questions per 24 h.`,
    },
    {
      id: "alerts",
      label: "Alerts can be delivered",
      state: i.alertTo && i.canEmail ? "ok" : "fail",
      detail: i.alertTo && i.canEmail ? `Billing, error and budget alerts go to ${i.alertTo}.` : "Set RESEND_API_KEY and ASK_ALERT_EMAIL (or SUPPORT_INBOX_EMAIL).",
    },
    {
      id: "key",
      label: "Anthropic key",
      state: i.hasOwnKey ? "ok" : i.hasKey ? "warn" : "fail",
      detail: i.hasOwnKey
        ? "ANTHROPIC_ASK_API_KEY is set: Ask spends from its own capped workspace."
        : i.hasKey
          ? "Only the shared ANTHROPIC_API_KEY is set. Add ANTHROPIC_ASK_API_KEY from a workspace with a monthly limit."
          : "No key: Ask can't answer.",
    },
    {
      id: "paused",
      label: "Ask switched on",
      state: i.paused ? "warn" : "ok",
      detail: i.paused ? "ASK_PAUSED is true in src/lib/ask/status.ts: members see the \"back soon\" notice. Turn it off last." : "Ask is answering.",
    },
  ];
}

/** Gathers the facts and runs the checks. */
export async function runPreflight(): Promise<PreflightCheck[]> {
  const admin = supabaseAdmin();
  const day = lagosDay(new Date());
  const ok = (r: { error: unknown }) => !r.error;
  const [books, passWindow, offerCaps] = await Promise.all([
    admin.from("ask_spend").select("key", { head: true, count: "exact" }).then(ok, () => false),
    // A zero cap with a minimum of 1 is always refused: it proves the function exists and books nothing.
    admin
      .rpc("ask_spend_reserve_on", { p_key: "preflight", p_day: day, p_amount: 1, p_min: 1, p_cap: 0, p_enforce: true })
      .then(ok, () => false),
    admin.from("offers").select("ask_cap_usd").limit(1).then(ok, () => false),
  ]);
  // The same address the ledger sends to (lib/ask/ledger.ts ALERT_TO).
  const alertTo = process.env.ASK_ALERT_EMAIL?.trim() || process.env.SUPPORT_INBOX_EMAIL?.trim() || "support@kiqstat.app";
  return preflightChecks({
    paused: ASK_PAUSED,
    config: askConfig(),
    hasKey: Boolean(askApiKey()),
    hasOwnKey: Boolean(process.env.ANTHROPIC_ASK_API_KEY?.trim()),
    alertTo,
    canEmail: Boolean(process.env.RESEND_API_KEY?.trim()),
    books,
    passWindow,
    offerCaps,
  });
}
