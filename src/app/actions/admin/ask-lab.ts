"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { PRESETS, labKey, labSlate, rateAnswer, runBenchCase, type CaseResult } from "@/lib/ask/lab";
import { BENCH_CASES, type SlateFixture } from "@/lib/ask/bench-cases";

/**
 * The Ask lab's actions. Running spends money (on the separate test key), so
 * it is the owner's call (model.manage); rating answers is open to anyone
 * who can see the lab.
 */

export type StartState = { error: string | null; runId: string | null; slate: SlateFixture[]; total: number };

export async function startLabRun(presetId: string): Promise<StartState> {
  const gate = await checkPermission("model.manage");
  if (!gate.ok) return { error: gate.error, runId: null, slate: [], total: 0 };
  if (!labKey()) return { error: "Set ANTHROPIC_TEST_API_KEY in this environment first. The lab never spends on the production key.", runId: null, slate: [], total: 0 };
  if (!PRESETS.some((p) => p.id === presetId)) return { error: "Unknown settings.", runId: null, slate: [], total: 0 };
  const runId = `${presetId}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${randomUUID().slice(0, 4)}`;
  const slate = await labSlate();
  await logAdminAction(gate.identity, "ask_lab.run_started", runId, { preset: presetId, questions: BENCH_CASES.length });
  return { error: null, runId, slate, total: BENCH_CASES.length };
}

export async function runLabCase(runId: string, presetId: string, caseIndex: number, slate: SlateFixture[]): Promise<CaseResult | { error: string }> {
  const gate = await checkPermission("model.manage");
  if (!gate.ok) return { error: gate.error };
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset || !Number.isInteger(caseIndex) || caseIndex < 0 || caseIndex >= BENCH_CASES.length || !/^[\w-]{3,60}$/.test(runId)) {
    return { error: "Bad request." };
  }
  try {
    return await runBenchCase(runId, preset, caseIndex, slate.slice(0, 40));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The question failed." };
  }
}

export async function rateLabAnswer(questionId: string, rating: "good" | "ok" | "poor" | null): Promise<{ error: string | null }> {
  const gate = await checkPermission("model.view");
  if (!gate.ok) return { error: gate.error };
  if (!/^[0-9a-f-]{36}$/.test(questionId)) return { error: "Bad request." };
  await rateAnswer(questionId, rating);
  revalidatePath("/admin/ask-lab");
  return { error: null };
}
