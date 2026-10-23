"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Input, Spinner } from "@/components/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { BookCodeButton } from "@/components/slip/book-code-button";
import { odds, percent } from "@/lib/format";
import type { SlipLeg } from "@/lib/slip";
import type { EditResult } from "@/lib/code-editor";
import type { CodeScore, ScoredGame, Verdict } from "@/lib/code-scan-core";

interface ScanView extends CodeScore {
  code: string;
  deadline: number | null;
  games: ScoredGame[];
}

const VERDICT: Record<Verdict, { tone: "brand" | "neutral" | "amber" | "rose"; label: string }> = {
  strong: { tone: "brand", label: "Strong" },
  fair: { tone: "neutral", label: "Fair" },
  risky: { tone: "rose", label: "Risky" },
  unreadable: { tone: "amber", label: "Can't read" },
  locked: { tone: "neutral", label: "Pro" },
};

/** The edited code as slip legs, which the booking route already understands. */
const toLegs = (r: EditResult): SlipLeg[] =>
  r.games.map((g) => ({
    matchId: g.matchId,
    fixture: `${g.homeName} v ${g.awayName}`,
    homeName: g.homeName,
    awayName: g.awayName,
    league: g.league,
    kickoff: new Date(g.kickoff).toISOString(),
    market: g.market,
    label: g.label,
    probability: g.probability,
    fairOdds: g.fairOdds,
  }));

/**
 * Paste any SportyBet code: see the model's read of every game on it, then
 * make it safer or re-pick it to land near a price, and take the new code.
 */
export function CodeEditor({ signedIn }: { signedIn: boolean }) {
  const [code, setCode] = useState("");
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<"safer" | "target">("safer");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ scan: ScanView; safer: EditResult | null; target: EditResult | null } | null>(null);

  const run = async (wanted: "safer" | "target") => {
    setPending(true);
    setError(null);
    setMode(wanted);
    try {
      const t = Number(target);
      const response = await fetch("/api/code-hub/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...(wanted === "target" && t > 1 ? { target: t } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.scan) {
        setError(body?.error ?? "Couldn't read that code just now.");
        setData(null);
      } else {
        setData(body);
      }
    } catch {
      setError("No connection. Check your network and try again.");
    } finally {
      setPending(false);
    }
  };

  const edited = data ? (mode === "target" ? data.target : data.safer) : null;

  return (
    <section className="card space-y-5 p-4 sm:p-6" aria-labelledby="editor-heading">
      <div>
        <h2 id="editor-heading" className="sr-only">
          Check any code. Make it safer.
        </h2>
        <p className="text-sm text-ink-muted">
          Paste a SportyBet code. We read every game on it, give the model&apos;s read of each pick, and re-pick it to be
          safer or to land near the odds you want.
        </p>
      </div>

      {!signedIn ? (
        <p className="text-sm text-ink-muted">
          <Link href="/account/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>{" "}
          to check a code. Checking is free.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
              placeholder="SportyBet code, e.g. 5CKNWH"
              aria-label="SportyBet code"
              className="font-mono tracking-[0.12em] sm:max-w-xs"
            />
            <Button onClick={() => run("safer")} disabled={pending || code.length < 4} className="py-2.5">
              {pending && mode === "safer" && <Spinner className="size-3.5" />}
              Make it safer
            </Button>
            <div className="flex gap-2">
              {/* The width sits on a wrapper: Input is always w-full, which a w-28 on it cannot beat. */}
              <div className="w-28 shrink-0">
                <Input
                  value={target}
                  onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, "").slice(0, 6))}
                  placeholder="Odds, e.g. 10"
                  aria-label="Target odds"
                  inputMode="decimal"
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => run("target")}
                disabled={pending || code.length < 4 || !(Number(target) > 1.2)}
                className="flex-1 whitespace-nowrap py-2.5 sm:flex-none"
              >
                {pending && mode === "target" && <Spinner className="size-3.5" />}
                Hit these odds
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-rose">{error}</p>}
        </div>
      )}

      {data && (
        // min-w-0 on the grid and its cards: without it a card grows to its
        // longest one-line game name and runs off a phone's screen.
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <ScanCard scan={data.scan} />
          {edited ? (
            <EditedCard result={edited} before={data.scan} mode={mode} />
          ) : (
            <div className="min-w-0 rounded-xl border border-dashed border-line p-5 text-sm text-ink-muted">
              {mode === "target" && !data.target
                ? "Enter the odds you want and tap Hit these odds."
                : "None of these games can still be re-picked: they have started, or we can't read them."}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ScanCard({ scan }: { scan: ScanView }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-sm font-bold tracking-[0.12em]">{scan.code}</p>
        <p className="text-xs text-ink-dim">
          {scan.readable} of {scan.total} games read
        </p>
      </div>
      <Totals chance={scan.chance} oddsValue={scan.odds} label="As it is" />
      <ul className="mt-3 space-y-2">
        {scan.games.map((g) => (
          <li key={`${g.eventId}-${g.market}`} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold">{g.label}</span>
              <span className="block truncate text-xs text-ink-dim">
                {g.homeName} v {g.awayName}
                {g.kickoff && (
                  <>
                    {" · "}
                    <LocalTime iso={new Date(g.kickoff).toISOString()} kind="dayTime" />
                  </>
                )}
              </span>
              {/* Why a game wasn't read: worth reading in full, so it wraps rather than being cut off. */}
              {g.reason && <span className="mt-0.5 block text-xs text-amber">{g.reason}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {g.probability !== null && <span className="font-mono text-xs text-ink-muted">{percent(g.probability)}</span>}
              <Badge tone={VERDICT[g.verdict].tone}>{VERDICT[g.verdict].label}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditedCard({ result, before, mode }: { result: EditResult; before: ScanView; mode: "safer" | "target" }) {
  const changed = result.games.filter((g) => g.from).length;
  const kept = new Set(result.games.map((g) => g.matchId));
  const left = before.games.filter((g) => !g.matchId || !kept.has(g.matchId));
  const dropped = left.length;
  return (
    <div className="min-w-0 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">{mode === "safer" ? "Safer version" : "Re-picked for your odds"}</p>
        <p className="text-xs text-ink-dim">
          {changed} changed{dropped > 0 ? `, ${dropped} dropped` : ""}
        </p>
      </div>
      <Totals chance={result.chance} oddsValue={result.fairOdds} label="Edited" fair />
      <ul className="mt-3 space-y-2">
        {result.games.map((g) => (
          <li key={g.matchId} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold">{g.label}</span>
              <span className="block truncate text-xs text-ink-dim">
                {g.homeName} v {g.awayName}
              </span>
              {g.from && <span className="block break-words text-xs text-amber">was {g.from.label}</span>}
            </span>
            <span className="shrink-0 font-mono text-xs text-ink-muted">{percent(g.probability)}</span>
          </li>
        ))}
      </ul>
      {left.length > 0 && (
        <p className="mt-3 text-xs text-ink-dim">
          Left off:{" "}
          {left.map((g) => `${g.homeName ?? "?"} v ${g.awayName ?? "?"}`).join(", ")}. A game is left off when it starts
          within 10 minutes, we can&apos;t read it, or its read is Pro-only until kick-off.
        </p>
      )}
      <div className="mt-4 border-t border-line pt-4">
        <BookCodeButton legs={toLegs(result)} label="Get the new SportyBet code" />
      </div>
    </div>
  );
}

function Totals({ chance, oddsValue, label, fair = false }: { chance: number | null; oddsValue: number | null; label: string; fair?: boolean }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3">
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{label}: chance</dt>
        <dd className="tnum mt-0.5 text-lg font-bold">{chance === null ? "–" : percent(chance, chance < 0.1 ? 1 : 0)}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{fair ? "Fair odds" : "SportyBet odds"}</dt>
        <dd className="tnum mt-0.5 text-lg font-bold">{oddsValue === null ? "–" : odds(oddsValue)}</dd>
      </div>
    </dl>
  );
}
