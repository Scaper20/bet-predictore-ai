import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Ask KiqStat's money controls under simulated load and failure, with no
 * database and no model calls: the ledger runs against an in-memory copy of
 * ask_spend_reserve, ask_spend_reserve_on and ask_spend_settle (0088, 0089)
 * that follows the SQL line for line, and failures are injected on purpose.
 * The same checks against real Postgres are in ledger.staging.test.ts.
 */

vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({ sendEmail: async (m: { to: string; subject: string }) => void sent.push(m) }));
vi.mock("@/lib/ask/tools", () => ({ ASK_TOOLS: [], toolStatus: () => "Working…", runTool: async () => ({ content: "{}" }) }));

type Book = { spent: number; reserved: number };
const db = {
  spend: new Map<string, Book>(),
  alerts: new Map<string, number>(),
  /** Injected failures: which RPCs answer with an error, and how often. */
  failing: new Set<string>(),
  flaky: 0,
  calls: 0,
};
const TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function reserve(key: string, day: string, amount: number, min: number, cap: number, enforce: boolean) {
  const id = `${key}|${day}`;
  const row = db.spend.get(id) ?? { spent: 0, reserved: 0 };
  db.spend.set(id, row);
  const { spent, reserved } = row;
  let grant: number;
  if (enforce) {
    grant = Math.min(amount, cap - spent - reserved);
    if (grant < min) return [{ allowed: false, granted: 0, spent, reserved, spend_day: day }];
  } else grant = amount;
  row.reserved += grant;
  return [{ allowed: spent + reserved + amount <= cap, granted: grant, spent, reserved: reserved + grant, spend_day: day }];
}

function rpc(name: string, a: Record<string, never>) {
  db.calls++;
  // Each call resolves on a later tick, so parallel requests interleave as they would over the network.
  return new Promise<{ data: unknown; error: unknown }>((resolve) =>
    setTimeout(() => {
      if (db.failing.has(name) || (db.flaky > 0 && Math.random() < db.flaky)) return resolve({ data: null, error: { message: "down" } });
      if (name === "ask_spend_reserve") return resolve({ data: reserve(a.p_key, TODAY(), a.p_amount, a.p_min, a.p_cap, a.p_enforce), error: null });
      if (name === "ask_spend_reserve_on") return resolve({ data: reserve(a.p_key, a.p_day, a.p_amount, a.p_min, a.p_cap, a.p_enforce), error: null });
      if (name === "ask_spend_settle") {
        const row = db.spend.get(`${a.p_key}|${a.p_day}`);
        if (!row) return resolve({ data: null, error: null });
        row.reserved = Math.max(row.reserved - Number(a.p_reserved), 0);
        row.spent += Math.max(Number(a.p_actual), 0);
        return resolve({ data: row.spent, error: null });
      }
      resolve({ data: null, error: { message: `no ${name}` } });
    }, Math.random() * 3),
  );
}

/** Just enough of supabase-js for the alerts: ask_alerts claims (update … eq … lt … select) and the error count. */
function from(table: string) {
  const q: { update?: boolean; key?: string; cutoff?: string } = {};
  const settle = () => {
    if (table === "ask_alerts" && q.update && q.key) {
      const at = db.alerts.get(q.key);
      const claimed = at !== undefined && q.cutoff && at < Date.parse(q.cutoff) ? (db.alerts.set(q.key, Date.now()), [{ key: q.key }]) : [];
      return { data: claimed, error: null };
    }
    return { data: [], count: 0, error: null };
  };
  const chain = {
    update: () => ((q.update = true), chain),
    insert: async (v: { key: string }) => {
      if (db.alerts.has(v.key)) return { error: { message: "duplicate" } };
      db.alerts.set(v.key, Date.now());
      return { error: null };
    },
    select: () => chain,
    eq: (_c: string, v: string) => ((q.key = v), chain),
    gte: () => chain,
    lt: (_c: string, cutoff: string) => ((q.cutoff = cutoff), chain),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, bad),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ rpc, from }) }));

const { reserveSpend, settleSpend, checkAlerts } = await import("./ledger");
const { askConfig } = await import("./config");
const { runAsk } = await import("./engine");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const USD = 1_000_000;
const enforce = (env: Record<string, string> = {}) => askConfig({ ASK_GUARD: "enforce", ...env });
const book = (key: string, day = TODAY()) => db.spend.get(`${key}|${day}`) ?? { spent: 0, reserved: 0 };

beforeEach(() => {
  db.spend.clear();
  db.alerts.clear();
  db.failing.clear();
  db.flaky = 0;
  sent.length = 0;
});

describe("Ask spending under load (simulated)", () => {
  it("never lets 300 parallel questions across 30 accounts and passes pass any cap or the budget", async () => {
    const config = enforce({ ASK_DAILY_BUDGET_USD: "0.5" });
    const buckets = Array.from({ length: 30 }, (_, i) =>
      i % 3 === 0
        ? { key: `pass:${i}`, capMicros: 0.14 * USD, day: "2026-10-29" }
        : { key: `user:${i}`, capMicros: (i % 3 === 1 ? 0.04 : 0.1) * USD },
    );
    const asks = Array.from({ length: 300 }, (_, i) => buckets[i % buckets.length]);
    await Promise.all(
      asks.map(async (b) => {
        const r = await reserveSpend(b, config);
        if (!r.ok) return;
        // Each answer costs anything up to what it was granted, as the engine guarantees.
        await settleSpend(r.reservation, Math.floor(Math.random() * (r.grantedMicros + 1)));
      }),
    );
    for (const b of buckets) {
      const row = book(b.key, b.day);
      expect(row.spent, b.key).toBeLessThanOrEqual(b.capMicros);
      expect(row.reserved, b.key).toBe(0);
    }
    expect(book("global").spent).toBeLessThanOrEqual(0.5 * USD);
    expect(book("global").reserved).toBe(0);
  });

  it("keeps a pass inside one cap across midnight: no second day of room", async () => {
    const config = enforce();
    const bucket = { key: "pass:night", capMicros: 0.14 * USD, day: "2026-10-30" };
    let granted = 0;
    for (let i = 0; i < 20; i++) {
      const r = await reserveSpend(bucket, config);
      if (r.ok) {
        granted += r.grantedMicros;
        await settleSpend(r.reservation, r.grantedMicros);
      }
    }
    expect(granted).toBe(0.14 * USD);
    expect(book("pass:night", "2026-10-30")).toEqual({ spent: 0.14 * USD, reserved: 0 });
    expect([...db.spend.keys()].filter((k) => k.startsWith("pass:night"))).toEqual(["pass:night|2026-10-30"]);
  });
});

describe("Ask spending when things fail (simulated)", () => {
  it("refuses every question when enforcing and the books are down, lets them through when observing", async () => {
    db.failing.add("ask_spend_reserve");
    const b = { key: "user:a", capMicros: 0.04 * USD };
    expect(await reserveSpend(b, enforce())).toMatchObject({ ok: false, grantedMicros: 0 });
    expect((await reserveSpend(b, askConfig({ ASK_GUARD: "observe" }))).ok).toBe(true);
  });

  it("refuses a pass when its window function is missing (0089 not applied) and leaves the budget untouched", async () => {
    db.failing.add("ask_spend_reserve_on");
    const r = await reserveSpend({ key: "pass:x", capMicros: 0.14 * USD, day: "2026-10-30" }, enforce());
    expect(r).toMatchObject({ ok: false, grantedMicros: 0 });
    expect(book("global")).toEqual({ spent: 0, reserved: 0 });
  });

  it("with the books failing at random, never overspends and never strands the budget", async () => {
    db.flaky = 0.2;
    const config = enforce({ ASK_DAILY_BUDGET_USD: "0.2" });
    const b = { key: "user:flaky", capMicros: 0.1 * USD };
    await Promise.all(
      Array.from({ length: 200 }, async () => {
        const r = await reserveSpend(b, config);
        if (r.ok) await settleSpend(r.reservation, r.grantedMicros);
      }),
    );
    db.flaky = 0;
    // A settle that failed leaves its hold in place: room is lost, never gained.
    const own = book("user:flaky");
    expect(own.spent + own.reserved).toBeLessThanOrEqual(0.1 * USD);
    const global = book("global");
    expect(global.spent + global.reserved).toBeLessThanOrEqual(0.2 * USD);
  });

  it("books nothing and alerts once an hour when Anthropic refuses for credit", async () => {
    const config = enforce();
    const noCredit = new Anthropic.APIError(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } }, "Your credit balance is too low", new Headers());
    const client = {
      beta: { messages: { stream: () => ({ on() { return this; }, currentMessage: { usage: {} }, finalMessage: async () => { throw noCredit; } }) } },
    } as never;
    const r = await reserveSpend({ key: "user:b", capMicros: 0.04 * USD }, config);
    const result = await runAsk({ client, config, messages: [{ role: "user", content: "hi" }], toolContext: {} as never, emit: () => {}, ceilingMicros: r.grantedMicros, enforce: true });
    expect(result).toMatchObject({ answered: false, billing: true, costMicros: 0 });
    const after = await settleSpend(r.reservation, result.costMicros);
    expect(book("user:b")).toEqual({ spent: 0, reserved: 0 });
    for (let i = 0; i < 3; i++) await checkAlerts({ result, config, globalSpentAfter: after, blockedBy: null });
    expect(sent.map((m) => m.subject)).toEqual(["[Ask KiqStat] Anthropic refused the request: credit or key"]);
  });

  it("alerts at 50%, 80% and 100% of the daily budget, once each", async () => {
    const config = enforce({ ASK_DAILY_BUDGET_USD: "1" });
    for (const spent of [0.3, 0.55, 0.6, 0.85, 1.0, 1.0]) await checkAlerts({ result: null, config, globalSpentAfter: spent * USD, blockedBy: null });
    await checkAlerts({ result: null, config, globalSpentAfter: USD, blockedBy: "budget" });
    await checkAlerts({ result: null, config, globalSpentAfter: USD, blockedBy: "budget" });
    expect(sent.map((m) => m.subject)).toEqual([
      "[Ask KiqStat] Daily AI budget 50% used",
      "[Ask KiqStat] Daily AI budget 80% used",
      "[Ask KiqStat] Daily AI budget 100% used",
      "[Ask KiqStat] Daily AI budget reached: questions paused",
    ]);
  });
});
