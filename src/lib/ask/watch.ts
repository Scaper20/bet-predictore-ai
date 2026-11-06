/**
 * The daily Ask watch (CTO checklist 3.4): is Ask KiqStat still paying for
 * itself, and is any account or day behaving unlike its history? Pure, so the
 * rules are tested; src/app/api/cron/ask-watch/route.ts feeds it the ledger
 * and emails what it finds.
 *
 * The live alerts in ledger.ts react to one question (credit refused, a run of
 * errors, the daily budget). These look at trends the single-question view
 * cannot see.
 */

export const DAY_MS = 86_400_000;
/** Lagos is UTC+1 all year, so a Lagos day is the UTC day of (time + 1 hour). */
export const lagosDay = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);

export interface WatchQuestion {
  /** null for a guest. */
  userId: string | null;
  tier: string;
  /** Epoch ms. */
  at: number;
  usd: number;
  outcome: string | null;
}

export interface WatchInput {
  now: number;
  questions: WatchQuestion[];
  /** Revenue collected over the same trailing 30 days, in naira. */
  revenue30dNaira: number;
  nairaPerUsd: number;
  /** The daily dollar cap of a plan, from the Ask config. */
  capUsd: (tier: string) => number;
}

export type Severity = "warn" | "critical";
export interface Finding {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
}

/** Thresholds, in one place so a change is one edit. */
export const WATCH = {
  /** Ask spend as a share of revenue over 30 days. */
  marginWarn: 0.1,
  marginCritical: 0.2,
  /** An account at this share of its daily cap on this many of the last 5 days. */
  nearCapShare: 0.8,
  nearCapDays: 3,
  /** Yesterday's spend against the account's own average, and an absolute floor. */
  spikeFactor: 5,
  spikeFloorUsd: 0.03,
  /** Yesterday's cost per question against the previous 7 days, and a sample floor. */
  costPerQuestionFactor: 2,
  minQuestions: 10,
  /** Share of yesterday's questions that ended in an error or a cancel. */
  failShare: 0.3,
  /** Ask spend with nothing collected before the margin rule means anything. */
  noRevenueFloorUsd: 2,
} as const;

const usd = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function evaluateWatch(input: WatchInput): Finding[] {
  const { now, nairaPerUsd } = input;
  const findings: Finding[] = [];
  const today = lagosDay(now);
  const dayOf = (q: WatchQuestion) => lagosDay(q.at);
  const yesterday = lagosDay(now - DAY_MS);

  // 1. Margin: what Ask cost against what came in.
  const spend30 = sum(input.questions.filter((q) => q.at > now - 30 * DAY_MS).map((q) => q.usd));
  const revenueUsd = input.revenue30dNaira / nairaPerUsd;
  if (revenueUsd > 0) {
    const share = spend30 / revenueUsd;
    if (share >= WATCH.marginWarn) {
      const critical = share >= WATCH.marginCritical;
      findings.push({
        key: `margin:${critical ? "critical" : "warn"}`,
        severity: critical ? "critical" : "warn",
        title: `Ask is using ${Math.round(share * 100)}% of revenue`,
        detail: `Over the last 30 days Ask cost ${usd(spend30)} against ${usd(revenueUsd)} collected (₦${Math.round(input.revenue30dNaira).toLocaleString("en-US")} at ₦${nairaPerUsd}). The plans are priced to keep this well under ${Math.round(WATCH.marginWarn * 100)}%.`,
      });
    }
  } else if (spend30 >= WATCH.noRevenueFloorUsd) {
    findings.push({ key: "margin:norevenue", severity: "warn", title: "Ask is spending with no revenue", detail: `Ask cost ${usd(spend30)} in 30 days and nothing was collected.` });
  }

  // 2 and 3. Accounts: living at the cap, or a sudden spike.
  const byAccount = new Map<string, WatchQuestion[]>();
  for (const q of input.questions) if (q.userId) byAccount.set(q.userId, [...(byAccount.get(q.userId) ?? []), q]);
  for (const [id, qs] of byAccount) {
    const perDay = new Map<string, number>();
    for (const q of qs) perDay.set(dayOf(q), (perDay.get(dayOf(q)) ?? 0) + q.usd);
    const tier = qs.reduce((a, b) => (b.at > a.at ? b : a)).tier;
    const cap = input.capUsd(tier);

    const last5 = [1, 2, 3, 4, 5].map((i) => perDay.get(lagosDay(now - i * DAY_MS)) ?? 0);
    const nearCap = last5.filter((d) => cap > 0 && d >= cap * WATCH.nearCapShare).length;
    if (nearCap >= WATCH.nearCapDays) {
      findings.push({
        key: `nearcap:${id}`,
        severity: "warn",
        title: `One ${tier} account is at its Ask cap most days`,
        detail: `Account ${id.slice(0, 8)} reached at least ${Math.round(WATCH.nearCapShare * 100)}% of its ${usd(cap)} daily cap on ${nearCap} of the last 5 days. Heavy use, or automation.`,
      });
    }

    const before = Array.from({ length: 14 }, (_, i) => perDay.get(lagosDay(now - (i + 2) * DAY_MS)) ?? 0);
    const avg = sum(before) / before.length;
    const y = perDay.get(yesterday) ?? 0;
    if (y >= WATCH.spikeFloorUsd && y > WATCH.spikeFactor * avg) {
      findings.push({
        key: `spike:${id}:${yesterday}`,
        severity: "warn",
        title: `One ${tier} account spent ${usd(y)} yesterday`,
        detail: `Account ${id.slice(0, 8)} usually costs ${usd(avg)} a day; yesterday was ${avg > 0 ? `${(y / avg).toFixed(0)}×` : "a new high"} that.`,
      });
    }
  }

  // 4. Cost per question: a change in what a question costs.
  const yq = input.questions.filter((q) => dayOf(q) === yesterday);
  const prior = input.questions.filter((q) => q.at > now - 8 * DAY_MS && dayOf(q) !== yesterday && dayOf(q) !== today);
  if (yq.length >= WATCH.minQuestions && prior.length >= WATCH.minQuestions) {
    const nowAvg = sum(yq.map((q) => q.usd)) / yq.length;
    const wasAvg = sum(prior.map((q) => q.usd)) / prior.length;
    if (wasAvg > 0 && nowAvg > WATCH.costPerQuestionFactor * wasAvg) {
      findings.push({
        key: `cpq:${yesterday}`,
        severity: "warn",
        title: "A question cost more than twice as much yesterday",
        detail: `${usd(nowAvg)} a question against ${usd(wasAvg)} over the previous week (${yq.length} questions). A prompt, model or tool change, or longer questions.`,
      });
    }
  }

  // 5. Failures: errors and cancellations.
  if (yq.length >= WATCH.minQuestions) {
    const bad = yq.filter((q) => q.outcome === "error" || q.outcome === "aborted").length;
    if (bad / yq.length >= WATCH.failShare) {
      findings.push({
        key: `fail:${yesterday}`,
        severity: "critical",
        title: `${Math.round((100 * bad) / yq.length)}% of Ask questions failed or were cancelled yesterday`,
        detail: `${bad} of ${yq.length} ended in an error or a cancel. Cancelled answers still cost money.`,
      });
    }
  }
  return findings;
}
