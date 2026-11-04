"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rateLabAnswer, runLabCase, startLabRun } from "@/app/actions/admin/ask-lab";
import { Button, Spinner } from "@/components/ui/primitives";

interface PresetOption {
  id: string;
  name: string;
  detail: string;
}

const usd = (m: number) => `$${(m / 1_000_000).toFixed(4)}`;

/**
 * Runs the 40 test questions under one preset, one request per question, and
 * shows the tally as it goes. A plain loop from the click handler, so Stop
 * really stops it.
 */
export function AskLabRunner({ presets, ready }: { presets: PresetOption[]; ready: boolean }) {
  const router = useRouter();
  const [preset, setPreset] = useState(presets[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [spent, setSpent] = useState(0);
  const [max, setMax] = useState(0);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function run() {
    setError(null);
    setRunning(true);
    stop.current = false;
    setDone(0);
    setSpent(0);
    setMax(0);
    setFailed(0);
    const start = await startLabRun(preset);
    if (start.error || !start.runId) {
      setError(start.error ?? "Couldn't start.");
      setRunning(false);
      return;
    }
    setTotal(start.total);
    for (let i = 0; i < start.total && !stop.current; i++) {
      const r = await runLabCase(start.runId, preset, i, start.slate);
      if ("error" in r && !("caseId" in r)) {
        setError(r.error);
        break;
      }
      if ("caseId" in r) {
        setSpent((s) => s + r.costMicros);
        setMax((m) => Math.max(m, r.costMicros));
        if (r.outcome === "error") setFailed((f) => f + 1);
      }
      setDone(i + 1);
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[16rem] flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-dim">Settings to test</span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            disabled={running}
            className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}: {p.detail}
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <Button type="button" variant="secondary" onClick={() => (stop.current = true)}>
            Stop
          </Button>
        ) : (
          <Button type="button" onClick={run} disabled={!ready}>
            Run 40 questions
          </Button>
        )}
      </div>
      {(running || done > 0) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {running && <Spinner className="size-3.5" />}
          <span>
            {done} of {total} questions
          </span>
          <span className="font-mono">spent {usd(spent)}</span>
          <span className="font-mono">dearest {usd(max)}</span>
          {failed > 0 && <span className="text-rose">{failed} failed</span>}
        </p>
      )}
      {error && <p className="text-xs text-rose">{error}</p>}
    </div>
  );
}

/** Good / OK / Poor on one answer, for comparing quality across settings. */
export function RateAnswer({ questionId, rating }: { questionId: string; rating: string | null }) {
  const [value, setValue] = useState(rating);
  const set = async (v: "good" | "ok" | "poor") => {
    const next = value === v ? null : v;
    setValue(next);
    await rateLabAnswer(questionId, next);
  };
  const tone = { good: "border-brand text-brand", ok: "border-amber text-amber", poor: "border-rose text-rose" } as const;
  return (
    <div className="flex gap-1" role="group" aria-label="Rate this answer">
      {(["good", "ok", "poor"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => set(v)}
          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${value === v ? tone[v] : "border-line text-ink-dim hover:text-ink"}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
