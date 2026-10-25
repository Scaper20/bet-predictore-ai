"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Input, Spinner } from "@/components/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { BookCodeButton } from "@/components/slip/book-code-button";
import { odds, percent } from "@/lib/format";
import type { SlipLeg } from "@/lib/slip";
import { totals, type EditResult } from "@/lib/code-editor";
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

/** Where a chance came from, when it isn't our model's. */
const SOURCE: Partial<Record<NonNullable<ScoredGame["source"]>, string>> = {
  estimate: "Our estimate from when goals tend to come: not yet checked against results.",
  market: "SportyBet's own chance: we don't model this pick yet.",
  odds: "From SportyBet's price alone, margin taken off.",
};

/** A whole code's chance: long codes run to fractions of a percent, which "0.0%" would hide. */
const chanceText = (v: number) => (v < 0.001 ? "<0.1%" : percent(v, v < 0.1 ? 1 : 0));

/** The edited code without some games, its chance and odds recounted. */
function withoutGames(r: EditResult, removed: ReadonlySet<string>): EditResult {
  const games = r.games.filter((g) => !removed.has(g.matchId));
  return { ...r, ...totals(games), games };
}

/** The edited code as slip legs, which the booking route already understands. */
const toLegs = (r: EditResult): SlipLeg[] =>
  r.games.map((g) => ({
    matchId: g.matchId,
    ...(g.eventId ? { eventId: g.eventId } : {}),
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
  const [data, setData] = useState<{ scan: ScanView; safer: EditResult | null; target: EditResult | null; readAt: number } | null>(null);

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
        setError(
          body?.error ??
            (response.status === 429
              ? "Too many checks. Wait a minute and try again."
              : response.status >= 500
                ? "Something went wrong on our side. Try again shortly."
                : "Couldn't read that code just now."),
        );
        setData(null);
      } else {
        // The code was read; re-picking it may still have failed, and says so.
        setError(typeof body.error === "string" ? body.error : null);
        setData({ ...body, readAt: Date.now() });
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
                disabled={pending || code.length < 4 || !(Number(target) >= 1.2 && Number(target) <= 1000)}
                className="flex-1 whitespace-nowrap py-2.5 sm:flex-none"
              >
                {pending && mode === "target" && <Spinner className="size-3.5" />}
                Hit these odds
              </Button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-rose" role="alert">
              {error}
            </p>
          )}
          {target !== "" && !(Number(target) >= 1.2 && Number(target) <= 1000) && (
            <p className="text-xs text-ink-dim">Odds to hit: a number from 1.2 to 1,000, like 5 or 10.5.</p>
          )}
        </div>
      )}

      {data &&
        (edited ? (
          // The edited code leads: on a long code the original read is a long
          // scroll, and the new version is what people came for.
          <div className="min-w-0 space-y-3">
            <EditedCard result={edited} before={data.scan} mode={mode} />
            <details className="group min-w-0 rounded-xl border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="font-semibold">Your code as it is</span>{" "}
                  <span className="text-ink-dim">
                    · {data.scan.total} games
                    {data.scan.chance !== null && <> · {chanceText(data.scan.chance)}</>}
                  </span>
                </span>
                <span aria-hidden className="text-ink-dim transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="border-t border-line p-1">
                <ScanCard scan={data.scan} readAt={data.readAt} />
              </div>
            </details>
          </div>
        ) : (
          <div className="min-w-0 space-y-3">
            <div className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted">
              {mode === "target" && !data.target
                ? "Enter the odds you want and tap Hit these odds."
                : "None of these games can still be re-picked: they have started, or we can't read them."}
            </div>
            <ScanCard scan={data.scan} readAt={data.readAt} />
          </div>
        ))}
    </section>
  );
}

function ScanCard({ scan, readAt }: { scan: ScanView; /** When the code was read: what "started" is measured against. */ readAt: number }) {
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
              {!g.reason && g.kickoff !== null && g.kickoff <= readAt + 10 * 60_000 && (
                <span className="mt-0.5 block text-xs text-amber">
                  {g.kickoff <= readAt ? "Started: it can't be re-picked." : "Kicks off within 10 minutes: too late to re-pick."}
                </span>
              )}
              {g.source && SOURCE[g.source] && <span className="mt-0.5 block text-xs text-ink-dim">{SOURCE[g.source]}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {g.probability !== null && (
                <span className="font-mono text-xs text-ink-muted">
                  {percent(g.probability)}
                  {g.refund ? <span className="text-ink-dim"> · {percent(g.refund)} refund</span> : null}
                </span>
              )}
              <Badge tone={VERDICT[g.verdict].tone}>{VERDICT[g.verdict].label}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditedCard({ result: full, before, mode }: { result: EditResult; before: ScanView; mode: "safer" | "target" }) {
  // A pick SportyBet won't take can be dropped here and the rest booked (BookCodeButton).
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const result = removed.size ? withoutGames(full, removed) : full;
  const changedGames = result.games.filter((g) => g.from || (g.why && g.action !== "kept"));
  const keptGames = result.games.filter((g) => !changedGames.includes(g));
  // A game outside our coverage goes by SportyBet's event id.
  const kept = new Set(result.games.flatMap((g) => [g.matchId, g.eventId ?? ""]));
  const taken = new Set((result.removed ?? []).map((g) => g.matchId));
  const left = before.games.filter(
    (g) => !(g.matchId && (kept.has(g.matchId) || taken.has(g.matchId))) && !kept.has(g.eventId) && !taken.has(g.eventId),
  );
  const dropped = left.length + taken.size;
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-brand/30 bg-brand/5">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-display text-base font-bold">{mode === "safer" ? "Safer version" : "Re-picked for your odds"}</p>
          <p className="text-xs text-ink-dim">
            {result.games.length} games · {changedGames.length} changed{dropped > 0 ? ` · ${dropped} off` : ""}
          </p>
        </div>
        <BeforeAfter
          items={[
            { label: "Chance", before: before.chance, after: result.chance, show: chanceText },
            // SportyBet's own prices, which the booked code pays; the fair price only when one is unknown.
            result.odds !== null
              ? { label: "SportyBet odds", before: before.odds, after: result.odds, show: odds, note: result.oddsEstimated ? "est." : undefined }
              : { label: "Odds", before: before.odds, after: result.fairOdds, show: odds, note: "fair" },
          ]}
        />
        <BookCodeButton
          legs={toLegs(result)}
          remove={(matchId) => setRemoved((r) => new Set([...r, matchId]))}
          label="Get the new SportyBet code"
        />
        {result.notes?.map((n) => (
          <p key={n} className="text-xs text-amber">
            {n}
          </p>
        ))}
      </div>

      {changedGames.length > 0 && (
        <div className="border-t border-brand/20 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim">What changed</p>
          <ul className="mt-1 divide-y divide-line/60">
            {changedGames.map((g) => (
              <li key={g.matchId} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{g.label}</span>
                  {g.from && (
                    <span className="block break-words text-xs text-ink-dim">
                      was <span className="line-through">{g.from.label}</span>
                    </span>
                  )}
                  <span className="block truncate text-xs text-ink-dim">
                    {g.homeName} v {g.awayName}
                  </span>
                  {g.why && <span className="block break-words text-xs text-ink-dim">{g.why}</span>}
                </span>
                <span className="shrink-0 text-right font-mono text-xs">
                  <span className="block font-semibold text-brand">{percent(g.probability)}</span>
                  {g.price && <span className="block text-ink-dim">{odds(g.price)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {keptGames.length > 0 && (
        <details className="group border-t border-brand/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-semibold">Kept as they were</span> <span className="text-ink-dim">· {keptGames.length}</span>
            </span>
            <span aria-hidden className="text-ink-dim transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="divide-y divide-line/60 px-4 pb-3">
            {keptGames.map((g) => (
              <li key={g.matchId} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{g.label}</span>
                  <span className="block truncate text-xs text-ink-dim">
                    {g.homeName} v {g.awayName}
                  </span>
                  {g.source && SOURCE[g.source] && <span className="block break-words text-xs text-ink-dim">{SOURCE[g.source]}</span>}
                </span>
                <span className="shrink-0 text-right font-mono text-xs text-ink-muted">
                  <span className="block">{percent(g.probability)}</span>
                  {g.price && <span className="block text-ink-dim">{odds(g.price)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(taken.size > 0 || left.length > 0) && (
        <div className="space-y-1 border-t border-brand/20 px-4 py-3 text-xs text-ink-dim">
          {result.removed?.map((g) => (
            <p key={g.matchId} className="break-words">
              <span className="font-semibold text-rose">Taken off:</span> {g.label} ({g.homeName} v {g.awayName}). {g.why}
            </p>
          ))}
          {left.length > 0 && (
            <p>
              <span className="font-semibold">Left off:</span>{" "}
              {left.map((g) => `${g.homeName ?? "?"} v ${g.awayName ?? "?"}`).join(", ")}. A game is left off when it starts
              within 10 minutes, we can&apos;t read it, or its read is Pro-only until kick-off.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Before and after, side by side: what the edit bought. */
function BeforeAfter({
  items,
}: {
  items: { label: string; before: number | null; after: number | null; show: (v: number) => string; note?: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg bg-surface/70 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-ink-dim">
            {it.label}
            {it.note && <span className="normal-case tracking-normal"> ({it.note})</span>}
          </dt>
          <dd className="tnum mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
            {it.before !== null && <span className="text-xs text-ink-dim line-through">{it.show(it.before)}</span>}
            <span className="text-lg font-bold text-ink">{it.after === null ? "–" : it.show(it.after)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Totals({ chance, oddsValue, label, fair = false }: { chance: number | null; oddsValue: number | null; label: string; fair?: boolean }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3">
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{label}: chance</dt>
        <dd className="tnum mt-0.5 text-lg font-bold">{chance === null ? "–" : chanceText(chance)}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{fair ? "Fair odds" : "SportyBet odds"}</dt>
        <dd className="tnum mt-0.5 text-lg font-bold">{oddsValue === null ? "–" : odds(oddsValue)}</dd>
      </div>
    </dl>
  );
}
