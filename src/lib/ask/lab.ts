import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { upcomingFeed } from "@/lib/service";
import { PAID_VIEWER } from "@/lib/access";
import { APP_TIMEZONE } from "@/lib/format";
import { askConfig, type AskConfig, type AskPlan } from "@/lib/ask/config";
import { runAsk } from "@/lib/ask/engine";
import { logQuestion } from "@/lib/ask/ledger";
import { contextPreamble } from "@/lib/ask/request";
import { BENCH_CASES, fillCase, type BenchCategory, type SlateFixture } from "@/lib/ask/bench-cases";

/**
 * The Ask lab (admin/ask-lab): runs the test questions through the same
 * engine the live route uses, under settings chosen per run, on a separate
 * Anthropic key (ANTHROPIC_TEST_API_KEY) so lab spend never mixes with
 * production's. Every question is logged like a live one (source "bench"),
 * with its question and answer kept for review.
 */

export interface Preset {
  id: string;
  name: string;
  detail: string;
  maxTokens: number;
  maxRounds: number;
  effort: AskConfig["effort"];
  /** Enforce a per-question ceiling (USD), or only observe it. */
  enforceCeilingUsd: number | null;
}

export const PRESETS: Preset[] = [
  { id: "current", name: "As in production", detail: "8,000 output tokens a call, 6 calls, medium effort", maxTokens: 8000, maxRounds: 6, effort: "medium", enforceCeilingUsd: null },
  { id: "trim", name: "Shorter ceiling", detail: "1,500 tokens a call, 6 calls, medium", maxTokens: 1500, maxRounds: 6, effort: "medium", enforceCeilingUsd: null },
  { id: "trim4", name: "Shorter, 4 calls", detail: "1,500 tokens a call, 4 calls, medium", maxTokens: 1500, maxRounds: 4, effort: "medium", enforceCeilingUsd: null },
  { id: "trim4-low", name: "Shorter, 4 calls, low effort", detail: "1,500 tokens a call, 4 calls, low", maxTokens: 1500, maxRounds: 4, effort: "low", enforceCeilingUsd: null },
  { id: "capped", name: "With the ceiling on", detail: "1,500 tokens, 4 calls, medium, $0.01 a question enforced", maxTokens: 1500, maxRounds: 4, effort: "medium", enforceCeilingUsd: 0.01 },
];

export const labKey = (): string | undefined => process.env.ANTHROPIC_TEST_API_KEY?.trim() || undefined;

export function presetConfig(p: Preset): AskConfig {
  const base = askConfig(process.env, { maxTokens: p.maxTokens, maxRounds: p.maxRounds, effort: p.effort });
  return p.enforceCeilingUsd === null
    ? { ...base, guard: "observe" }
    : { ...base, guard: "enforce", requestCeilingMicros: Math.round(p.enforceCeilingUsd * 1_000_000), label: `${base.label}/cap${p.enforceCeilingUsd}` };
}

/** This week's modelled fixtures, for filling the questions. */
export async function labSlate(): Promise<SlateFixture[]> {
  const feed = await upcomingFeed(7).catch(() => null);
  return (feed?.matches ?? [])
    .filter((m) => m.status === "scheduled" && m.league.code)
    .slice(0, 40)
    .map((m) => ({ home: m.home.name, away: m.away.name, league: m.league.name }));
}

export interface CaseResult {
  caseId: string;
  outcome: string;
  costMicros: number;
  ms: number;
  calls: number;
  error: string | null;
}

/** Runs one test question under a preset. One per request keeps each well inside the function time limit. */
export async function runBenchCase(runId: string, preset: Preset, caseIndex: number, slate: SlateFixture[]): Promise<CaseResult> {
  const key = labKey();
  if (!key) throw new Error("Set ANTHROPIC_TEST_API_KEY first: the lab never spends on the production key.");
  const c = BENCH_CASES[caseIndex];
  const question = fillCase(c, slate, caseIndex);
  const config = presetConfig(preset);
  const result = await runAsk({
    client: new Anthropic({ apiKey: key }),
    config,
    messages: [{ role: "user", content: `${contextPreamble({ timeZone: APP_TIMEZONE }, new Date())}\n\n${question}` }],
    toolContext: { tier: "paid", viewer: PAID_VIEWER, timeZone: APP_TIMEZONE },
    emit: () => {},
    // Observing presets still measure against the ceiling, so the lab shows which questions it would have stopped.
    ceilingMicros: config.requestCeilingMicros,
    enforce: preset.enforceCeilingUsd !== null,
  });
  const id = await logQuestion({
    userId: null,
    guest: false,
    plan: "vip" satisfies AskPlan,
    source: "bench",
    config,
    result,
    guard: result.wouldStop ? "would_stop" : null,
    questionChars: question.length,
  });
  if (id) {
    await supabaseAdmin().from("ask_bench_results").insert({
      question_id: id,
      run_id: runId,
      case_id: c.id,
      category: c.category,
      question,
      answer: result.text || null,
      tools: result.tools,
      picks: result.picks,
    });
  }
  return { caseId: c.id, outcome: result.outcome, costMicros: result.costMicros, ms: result.ms, calls: result.calls.length, error: result.error };
}

/* -------------------------------------------------------------- reports */

export interface Stats {
  n: number;
  answered: number;
  avgCost: number;
  p95Cost: number;
  maxCost: number;
  avgMs: number;
  p95Ms: number;
  avgCalls: number;
  avgOutput: number;
  /** Share of prompt tokens read from cache. */
  cacheShare: number;
  stopped: number;
}

interface Q {
  cost_micros: number;
  ms: number | null;
  calls: number;
  output_tokens: number;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  outcome: string | null;
}

const pctile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

export function stats(rows: Q[]): Stats {
  const n = rows.length;
  const cost = rows.map((r) => Number(r.cost_micros));
  const ms = rows.map((r) => r.ms ?? 0);
  const prompt = rows.reduce((s, r) => s + Number(r.input_tokens) + Number(r.cache_write_tokens) + Number(r.cache_read_tokens), 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    n,
    answered: rows.filter((r) => r.outcome === "answered").length,
    avgCost: avg(cost),
    p95Cost: pctile(cost, 95),
    maxCost: Math.max(0, ...cost),
    avgMs: avg(ms),
    p95Ms: pctile(ms, 95),
    avgCalls: avg(rows.map((r) => r.calls)),
    avgOutput: avg(rows.map((r) => Number(r.output_tokens))),
    cacheShare: prompt ? rows.reduce((s, r) => s + Number(r.cache_read_tokens), 0) / prompt : 0,
    stopped: rows.filter((r) => r.outcome === "budget_stop").length,
  };
}

const Q_COLS = "id, created_at, config_label, cost_micros, ms, calls, output_tokens, input_tokens, cache_write_tokens, cache_read_tokens, outcome, tier, user_id";

export interface RunSummary {
  runId: string;
  label: string;
  started: string;
  overall: Stats;
  byCategory: Partial<Record<BenchCategory, Stats>>;
}

export interface BenchRow {
  runId: string;
  label: string;
  caseId: string;
  category: string;
  question: string;
  answer: string | null;
  tools: string[];
  picks: number;
  rating: string | null;
  questionId: string;
  costMicros: number;
  ms: number;
  calls: number;
  outcome: string | null;
}

/** Every lab run, newest first, with its numbers and each answer. */
export async function labRuns(limitRuns = 8): Promise<{ runs: RunSummary[]; rows: BenchRow[] }> {
  const admin = supabaseAdmin();
  const { data: results } = await admin
    .from("ask_bench_results")
    .select(`run_id, case_id, category, question, answer, tools, picks, rating, question_id, ask_questions!inner(${Q_COLS})`)
    .order("created_at", { ascending: false })
    .limit(2000);
  const rows: (BenchRow & { q: Q & { created_at: string; config_label: string } })[] = (results ?? []).map((r) => {
    const q = (Array.isArray(r.ask_questions) ? r.ask_questions[0] : r.ask_questions) as unknown as Q & { created_at: string; config_label: string };
    return {
      runId: r.run_id as string,
      label: q.config_label,
      caseId: r.case_id as string,
      category: r.category as string,
      question: r.question as string,
      answer: (r.answer as string | null) ?? null,
      tools: (r.tools as string[]) ?? [],
      picks: Number(r.picks ?? 0),
      rating: (r.rating as string | null) ?? null,
      questionId: r.question_id as string,
      costMicros: Number(q.cost_micros),
      ms: q.ms ?? 0,
      calls: q.calls,
      outcome: q.outcome,
      q,
    };
  });
  const byRun = new Map<string, typeof rows>();
  for (const r of rows) byRun.set(r.runId, [...(byRun.get(r.runId) ?? []), r]);
  const runs: RunSummary[] = [...byRun.entries()]
    .map(([runId, rs]) => {
      const byCategory: RunSummary["byCategory"] = {};
      for (const cat of new Set(rs.map((r) => r.category))) byCategory[cat as BenchCategory] = stats(rs.filter((r) => r.category === cat).map((r) => r.q));
      return {
        runId,
        label: rs[0].label,
        started: rs.reduce((m, r) => (r.q.created_at < m ? r.q.created_at : m), rs[0].q.created_at),
        overall: stats(rs.map((r) => r.q)),
        byCategory,
      };
    })
    .sort((a, b) => (a.started < b.started ? 1 : -1))
    .slice(0, limitRuns);
  const keep = new Set(runs.map((r) => r.runId));
  return { runs, rows: rows.filter((r) => keep.has(r.runId)).map(({ q: _q, ...r }) => r) };
}

export interface TierReport {
  tier: string;
  stats: Stats;
  totalCost: number;
  /** The most one account (or browser) cost in one day. */
  maxPerAccountDay: number;
  accounts: number;
}

/** Live questions by plan over the last `days`, with no account named. */
export async function liveByTier(days = 30): Promise<TierReport[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabaseAdmin().from("ask_questions").select(Q_COLS).eq("source", "live").gte("created_at", since).limit(50_000);
  const rows = (data ?? []) as (Q & { tier: string; user_id: string | null; created_at: string })[];
  const tiers = ["guest", "free", "pro", "vip", "pass"];
  return tiers
    .map((tier) => {
      const rs = rows.filter((r) => r.tier === tier);
      const perDay = new Map<string, number>();
      for (const r of rs) {
        const k = `${r.user_id ?? "guest"}:${r.created_at.slice(0, 10)}`;
        perDay.set(k, (perDay.get(k) ?? 0) + Number(r.cost_micros));
      }
      return {
        tier,
        stats: stats(rs),
        totalCost: rs.reduce((s, r) => s + Number(r.cost_micros), 0),
        maxPerAccountDay: Math.max(0, ...perDay.values()),
        accounts: new Set(rs.map((r) => r.user_id ?? "guest")).size,
      };
    })
    .filter((t) => t.stats.n > 0);
}

export async function rateAnswer(questionId: string, rating: "good" | "ok" | "poor" | null): Promise<void> {
  await supabaseAdmin().from("ask_bench_results").update({ rating }).eq("question_id", questionId);
}
