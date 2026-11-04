import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * Ask KiqStat's books (0088) against a real Supabase database, through
 * PostgREST, with the code the live route runs. Skipped unless pointed at a
 * development stack, never production:
 *
 *   npx supabase start            # applies every migration
 *   ASK_STAGING_DB=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service key> SUPABASE_ANON_KEY=<local anon key> \
 *   npx vitest run src/lib/ask/ledger.staging.test.ts
 */

const staging = process.env.ASK_STAGING_DB === "1" && /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

vi.mock("server-only", () => ({}));
const sent: { subject: string }[] = [];
vi.mock("@/lib/email", () => ({ sendEmail: async (m: { subject: string }) => void sent.push(m) }));
vi.mock("@/lib/ask/tools", () => ({
  ASK_TOOLS: [],
  toolStatus: () => "Working…",
  runTool: async () => ({ content: "{}" }),
}));

const { reserveSpend, settleSpend, logQuestion, checkAlerts } = await import("./ledger");
const { askConfig } = await import("./config");
type Config = ReturnType<typeof askConfig>;
/** A daily bucket at the plan's cap, as the route books Guest, Free, and monthly Pro and VIP. */
const reserve = (key: string, plan: "guest" | "free" | "pro" | "vip" | "pass", config: Config) => reserveSpend({ key, capMicros: config.dailyCapMicros[plan] }, config);
const { runAsk } = await import("./engine");
const { supabaseAdmin } = await import("@/lib/supabase/admin");

const USD = 1_000_000;
const enforce = (env: Record<string, string> = {}) => ({ ...askConfig({ ASK_GUARD: "enforce", ...env }), guard: "enforce" as const });
const spendRow = async (key: string) =>
  (await supabaseAdmin().from("ask_spend").select("day, spent_micros, reserved_micros").eq("key", key).maybeSingle()).data;

/** A model that streams `chunks` of text, each reporting `perChunk` more output tokens, until aborted. */
function fakeClient(chunks: number, perChunk = 50, onChunk?: (i: number) => void) {
  return {
    beta: {
      messages: {
        stream: (_req: unknown, opts: { signal?: AbortSignal }) => {
          const listeners: ((d: string) => void)[] = [];
          const usage = { input_tokens: 3000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
          const turn = {
            currentMessage: { usage },
            on: (_e: string, cb: (d: string) => void) => void listeners.push(cb),
            finalMessage: async () => {
              for (let i = 0; i < chunks; i++) {
                if (opts.signal?.aborted) throw new Error("Request was aborted.");
                usage.output_tokens += perChunk;
                listeners.forEach((l) => l("word "));
                onChunk?.(i);
                await new Promise((r) => setTimeout(r, 1));
              }
              return { content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage };
            },
          };
          return turn;
        },
      },
    },
  } as never;
}

describe.skipIf(!staging)("Ask books on a development database (0088)", () => {
  it("keeps the books away from browsers: anon can't read them or call the functions", async () => {
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
    const anon = process.env.SUPABASE_ANON_KEY ?? "";
    const headers = { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };
    for (const table of ["ask_spend", "ask_questions", "ask_calls", "ask_bench_results", "ask_alerts"]) {
      const r = await fetch(`${base}/${table}?select=*`, { headers });
      expect(r.ok, table).toBe(false);
    }
    const rpc = await fetch(`${base}/rpc/ask_spend_reserve`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_key: "x", p_amount: 1, p_min: 1, p_cap: 1, p_enforce: true }),
    });
    expect(rpc.ok).toBe(false);
  });

  it("books the day in Lagos time", async () => {
    const key = `test:${randomUUID()}`;
    const r = await reserve(key, "pro", enforce());
    const lagos = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    expect(r.reservation.holds.map((h) => h.day)).toEqual([lagos, lagos]);
    await settleSpend(r.reservation, 0);
  });

  it("stops a Pro account at its $0.04 day cap, then settles to what was spent", async () => {
    const key = `test:${randomUUID()}`;
    const config = enforce();
    const a = await reserve(key, "pro", config);
    const b = await reserve(key, "pro", config);
    const c = await reserve(key, "pro", config);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, false]);
    expect(c.over).toBe("subject");
    expect(a.grantedMicros + b.grantedMicros).toBe(0.04 * USD);
    expect(await spendRow(key)).toMatchObject({ spent_micros: 0, reserved_micros: 0.04 * USD });

    await settleSpend(a.reservation, 1_200);
    await settleSpend(b.reservation, 900);
    expect(await spendRow(key)).toMatchObject({ spent_micros: 2_100, reserved_micros: 0 });
    // The room the cheap answers left is available again.
    const d = await reserve(key, "pro", config);
    expect(d.ok).toBe(true);
    await settleSpend(d.reservation, 0);
  });

  it("lets 40 parallel requests from one account use no more than its cap", async () => {
    const key = `test:${randomUUID()}`;
    const config = enforce();
    const results = await Promise.all(Array.from({ length: 40 }, () => reserve(key, "vip", config)));
    const granted = results.reduce((s, r) => s + r.grantedMicros, 0);
    expect(granted).toBeLessThanOrEqual(config.dailyCapMicros.vip);
    expect(results.filter((r) => r.ok).length).toBe(config.dailyCapMicros.vip / config.requestCeilingMicros);
    // Every granted question spends its whole grant: the account lands exactly on its cap.
    await Promise.all(results.filter((r) => r.ok).map((r) => settleSpend(r.reservation, r.grantedMicros)));
    expect(await spendRow(key)).toMatchObject({ spent_micros: config.dailyCapMicros.vip, reserved_micros: 0 });
    expect((await reserve(key, "vip", config)).ok).toBe(false);
  });

  it("near the cap grants what's left if it covers a short answer, and refuses below that", async () => {
    const key = `test:${randomUUID()}`;
    const config = enforce();
    const first = await reserve(key, "pro", config);
    await settleSpend(first.reservation, 0.04 * USD - 5_000); // $0.005 left
    const near = await reserve(key, "pro", config);
    expect(near).toMatchObject({ ok: true, grantedMicros: 5_000 });
    await settleSpend(near.reservation, 4_900); // $0.0001 left
    expect(await reserve(key, "pro", config)).toMatchObject({ ok: false, over: "subject" });
  });

  it("observing, lets everything through and reports which cap it would have hit", async () => {
    const key = `test:${randomUUID()}`;
    const config = { ...askConfig({ ASK_GUARD: "observe" }), guard: "observe" as const };
    const rs = await Promise.all(Array.from({ length: 4 }, () => reserve(key, "pro", config)));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(rs.some((r) => r.over === "subject")).toBe(true);
    await Promise.all(rs.map((r) => settleSpend(r.reservation, 0)));
  });

  it("books a cancelled question for the tokens it streamed, and logs it with its calls", async () => {
    const key = `test:${randomUUID()}`;
    const config = enforce();
    const r = await reserve(key, "pro", config);
    const ac = new AbortController();
    const result = await runAsk({
      client: fakeClient(100, 50, (i) => i === 9 && ac.abort()),
      config,
      messages: [{ role: "user", content: "Who wins tonight?" }],
      toolContext: {} as never,
      emit: () => {},
      signal: ac.signal,
      ceilingMicros: r.grantedMicros,
      enforce: true,
    });
    expect(result.outcome).toBe("aborted");
    expect(result.costMicros).toBeGreaterThan(0);
    await settleSpend(r.reservation, result.costMicros);
    expect(await spendRow(key)).toMatchObject({ spent_micros: result.costMicros, reserved_micros: 0 });

    const id = await logQuestion({ userId: null, guest: false, plan: "pro", source: "bench", config, result, guard: null, questionChars: 17 });
    expect(id).toBeTruthy();
    const { data: q } = await supabaseAdmin().from("ask_questions").select("outcome, cost_micros, calls, output_tokens").eq("id", id!).single();
    expect(q).toMatchObject({ outcome: "aborted", cost_micros: result.costMicros, calls: 1, output_tokens: 500 });
    const { data: calls } = await supabaseAdmin().from("ask_calls").select("aborted, error, cost_micros").eq("question_id", id!);
    expect(calls).toEqual([{ aborted: true, error: "cancelled", cost_micros: result.costMicros }]);
    await supabaseAdmin().from("ask_questions").delete().eq("id", id!);
  });

  it("closes Ask for everyone at the daily budget and sends the alerts once", async () => {
    // The global key is shared, so this runs on a budget just above what is already booked today.
    const probe = await reserve(`test:${randomUUID()}`, "vip", enforce());
    await settleSpend(probe.reservation, 0);
    const budget = (probe.globalSpent + 0.03 * USD) / USD;
    const config = enforce({ ASK_DAILY_BUDGET_USD: String(budget) });
    sent.length = 0;
    const users = Array.from({ length: 4 }, () => `test:${randomUUID()}`);
    const rs = await Promise.all(users.map((u) => reserve(u, "vip", config)));
    const ok = rs.filter((r) => r.ok);
    expect(ok.reduce((s, r) => s + r.grantedMicros, 0)).toBeLessThanOrEqual(0.03 * USD);
    expect(rs.find((r) => !r.ok)?.over).toBe("budget");
    let after: number | null = null;
    for (const r of ok) after = await settleSpend(r.reservation, r.grantedMicros);
    for (let i = 0; i < 2; i++) await checkAlerts({ result: null, config, globalSpentAfter: after, blockedBy: "budget" });
    expect(sent.map((m) => m.subject).sort()).toEqual(["[Ask KiqStat] Daily AI budget 100% used", "[Ask KiqStat] Daily AI budget reached: questions paused"]);
    await supabaseAdmin().from("ask_alerts").delete().like("key", "budget:%");
  });

  it("books a pass to one bucket over its whole window, whatever the day (0089)", async () => {
    const config = enforce();
    const key = `pass:${randomUUID()}`;
    // A pass that started yesterday, Lagos time: its holds still land on its start date.
    const started = new Date(Date.now() - 20 * 3_600_000).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    const bucket = { key, capMicros: 0.14 * USD, day: started };
    const rs = await Promise.all(Array.from({ length: 12 }, () => reserveSpend(bucket, config)));
    const ok = rs.filter((r) => r.ok);
    expect(ok.reduce((s, r) => s + r.grantedMicros, 0)).toBeLessThanOrEqual(0.14 * USD);
    expect(rs.some((r) => !r.ok && r.over === "subject")).toBe(true);
    expect(ok.every((r) => r.reservation.holds.find((h) => h.key === key)?.day === started)).toBe(true);
    await Promise.all(ok.map((r) => settleSpend(r.reservation, r.grantedMicros)));
    const { data: rows } = await supabaseAdmin().from("ask_spend").select("day, spent_micros, reserved_micros").eq("key", key);
    expect(rows).toEqual([{ day: started, spent_micros: 0.14 * USD, reserved_micros: 0 }]);
    // The same pass the next day is still out of room: no fresh day of cap.
    expect((await reserveSpend(bucket, config)).ok).toBe(false);
  });

  it("refuses ask_spend_reserve_on from the browser", async () => {
    const anon = process.env.SUPABASE_ANON_KEY ?? "";
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/ask_spend_reserve_on`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: "x", p_day: "2026-10-30", p_amount: 1, p_min: 1, p_cap: 1, p_enforce: true }),
    });
    expect(r.ok).toBe(false);
  });

  it("fails closed when enforcing and the books can't be reached, open when observing", async () => {
    vi.resetModules();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
    try {
      const fresh = await import("./ledger");
      expect(await fresh.reserveSpend({ key: "test:down", capMicros: 40_000 }, enforce())).toMatchObject({ ok: false, grantedMicros: 0 });
      expect((await fresh.reserveSpend({ key: "test:down", capMicros: 40_000 }, { ...askConfig({}), guard: "observe" })).ok).toBe(true);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      vi.resetModules();
    }
  });
});
