/**
 * Plan-by-plan unit economics (CTO checklist 2.3).
 *
 *   npx tsx scripts/plan-economics.ts            prints the tables
 *   npx tsx scripts/plan-economics.ts --md       the same as markdown
 *
 * For each of the six recurring options (Pro and VIP, monthly / quarterly /
 * yearly) and the passes: what a customer pays, what the processor keeps, what a
 * partner earns (0 / 20 / 35% of the amount after the fee, as src/lib/partners.ts
 * pays it), what Ask KiqStat can cost, and the margin that is left, at three
 * exchange rates. The target is 25% margin.
 *
 * Prices, the fee and the Ask caps are read from the code so the script cannot
 * drift from what is sold. The only inputs written here are the assumptions
 * below; change them and re-run.
 *
 * Margin = (price - processor fee - partner commission - Ask cost) / price,
 * before fixed costs. Fixed costs are covered by item 2.4 (free-tier cost and
 * operating profit); this is the per-customer contribution.
 */

import { PLANS, type BillingCycle } from "../src/lib/pricing";
import { estimateFeeMinor, commissionMinor } from "../src/lib/partners";
import { DEFAULT_CYCLE_CAP_USD, DEFAULT_DAILY_CAP_USD, PASS_CAP_SHARE } from "../src/lib/ask/config";

/** Naira per dollar: a low case, the one the caps use, and a weak-naira case. */
export const RATES = [1400, 1550, 1700];
/** Partner commission rates, of the amount after the processor fee. */
export const COMMISSIONS = [0, 0.2, 0.35];
export const TARGET = 0.25;

/**
 * Measured Ask cost per question on Haiku 5.5, from ask_calls in production
 * (28 questions: $0.0262 in total, so $0.00094 each; dearest $0.0023).
 */
export const ASK_USD_PER_QUESTION = 0.00094;
/** Typical use (questions a day) against the allowance, for the "typical" line. */
export const TYPICAL_QUESTIONS_PER_DAY = { pro: 2, vip: 5, pass: 5 } as const;

const DAYS: Record<BillingCycle, number> = { monthly: 30, quarterly: 91, yearly: 365 };

export interface Option {
  key: string;
  label: string;
  tier: "pro" | "vip";
  naira: number;
  days: number;
  /** Ask spend ceiling over the whole period at the daily cap, in dollars. */
  capUsd: number;
  typicalUsd: number;
}

export function options(): Option[] {
  const out: Option[] = [];
  for (const id of ["pro", "vip"] as const) {
    const plan = PLANS.find((p) => p.id === id)!;
    for (const cycle of ["monthly", "quarterly", "yearly"] as BillingCycle[]) {
      const naira = plan.price[cycle];
      if (naira == null) continue;
      const days = DAYS[cycle];
      out.push({
        key: `${id}-${cycle}`,
        label: `${plan.name} ${cycle}`,
        tier: id,
        naira,
        days,
        capUsd: DEFAULT_CYCLE_CAP_USD[id][cycle] * days,
        typicalUsd: TYPICAL_QUESTIONS_PER_DAY[id] * ASK_USD_PER_QUESTION * days,
      });
    }
  }
  // Passes. The VIP day pass is the live offer; weekend and week are the withdrawn
  // standard passes, kept so the comparison with the old prices stays visible.
  const pass = (key: string, label: string, naira: number, days: number): Option => ({
    key,
    label,
    tier: "vip",
    naira,
    days,
    capUsd: Math.min(DEFAULT_DAILY_CAP_USD.pass * days, (naira / 1600) * PASS_CAP_SHARE),
    typicalUsd: TYPICAL_QUESTIONS_PER_DAY.pass * ASK_USD_PER_QUESTION * days,
  });
  out.push(pass("pass-day", "VIP day pass (live offer)", 500, 1));
  out.push(pass("pass-weekend", "Weekend pass (withdrawn)", 1000, 2));
  out.push(pass("pass-week", "Week pass (withdrawn)", 2000, 7));
  return out;
}

export interface Line {
  fee: number;
  commission: number;
  ask: number;
  margin: number;
  marginPct: number;
}

export function line(o: Option, rate: number, commissionRate: number, askUsd: number): Line {
  const feeMinor = estimateFeeMinor("paystack", "NGN", o.naira * 100);
  const fee = feeMinor / 100;
  const commission = commissionMinor(o.naira * 100 - feeMinor, Math.round(commissionRate * 10_000)) / 100;
  const ask = askUsd * rate;
  const margin = o.naira - fee - commission - ask;
  return { fee, commission, ask, margin, marginPct: margin / o.naira };
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export function report(md: boolean): string {
  const rows: string[] = [];
  const opts = options();
  const h = (s: string) => rows.push(md ? `\n## ${s}\n` : `\n=== ${s} ===`);
  const table = (head: string[], body: string[][]) => {
    if (md) {
      rows.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...body.map((r) => `| ${r.join(" | ")} |`));
    } else {
      rows.push(head.join("\t"), ...body.map((r) => r.join("\t")));
    }
  };

  h("Per option: price, fee, and Ask cost (₦, at ₦1,550 to the dollar)");
  table(
    ["Option", "Price", "Per day", "Processor fee", "Ask, typical", "Ask, at the cap"],
    opts.map((o) => {
      const l = line(o, 1550, 0, o.typicalUsd);
      return [o.label, n(o.naira), n(o.naira / o.days), n(l.fee), n(o.typicalUsd * 1550), n(o.capUsd * 1550)];
    }),
  );

  for (const [name, pick] of [
    ["Typical use", (o: Option) => o.typicalUsd],
    ["Worst case: Ask used to its daily cap every day", (o: Option) => o.capUsd],
  ] as const) {
    h(`Margin %, ${name}`);
    const head = ["Option", ...RATES.flatMap((r) => COMMISSIONS.map((c) => `₦${r} / ${pct(c)} comm`))];
    table(
      head,
      opts.map((o) => [
        o.label,
        ...RATES.flatMap((r) =>
          COMMISSIONS.map((c) => {
            const m = line(o, r, c, pick(o)).marginPct;
            return `${pct(m)}${m < TARGET ? " ✗" : ""}`;
          }),
        ),
      ]),
    );
  }

  h("Largest commission that still leaves the 25% target (₦1,550)");
  table(
    ["Option", "Typical use", "Worst case"],
    opts.map((o) => {
      const room = (askUsd: number) => {
        const l = line(o, 1550, 0, askUsd);
        const afterFee = o.naira - l.fee;
        const spare = o.naira - l.fee - l.ask - TARGET * o.naira;
        return spare <= 0 ? "none" : pct(Math.min(1, spare / afterFee));
      };
      return [o.label, room(o.typicalUsd), room(o.capUsd)];
    }),
  );

  return rows.join("\n");
}

if (process.argv[1]?.endsWith("plan-economics.ts")) {
  console.log(report(process.argv.includes("--md")));
}
