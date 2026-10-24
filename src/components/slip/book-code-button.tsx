"use client";

import Link from "next/link";
import { useState } from "react";
import { CodeBox } from "@/components/code-hub/code-box";
import { Button, Spinner } from "@/components/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { legTeams, type SlipLeg } from "@/lib/slip";

type LegProblem =
  | "unsupported-market"
  | "same-game-combo"
  | "unsupported-competition"
  | "not-listed"
  | "starting"
  | "not-offered"
  | "cant-combine"
  | "duplicate-game";

const WHY: Record<LegProblem, string> = {
  "unsupported-market": "SportyBet codes can't carry this pick type yet.",
  "same-game-combo": "SportyBet can't put this same-game combo on a code.",
  "cant-combine": "SportyBet won't combine these picks on one game.",
  "not-offered": "SportyBet isn't offering this line on this game right now.",
  "unsupported-competition": "This competition isn't linked to SportyBet yet.",
  "not-listed": "SportyBet isn't listing this game right now.",
  starting: "Kicks off too soon to load in time.",
  "duplicate-game": "Two picks on the same game can't share a code.",
};

/** A pick booked as the same bet under SportyBet's name for it on that game. */
interface Swap {
  matchId: string;
  label: string;
}

type Result =
  | { kind: "code"; code: string; url: string; deadline: number; remaining: number | null; swapped: Swap[] }
  | { kind: "problems"; problems: { matchId: string; problem: LegProblem }[] }
  | { kind: "error"; message: string; upgrade?: boolean; nextFreeAt?: number | null };

/** The combo's selections, so a result is only shown for the combo it was made for. */
const stampOf = (legs: SlipLeg[]) => legs.map((l) => `${l.matchId}|${l.market}`).join(",");

/**
 * "Get SportyBet code" for the combo on the slip.
 *
 * The server books it only when every pick can be found on SportyBet; any
 * pick it cannot book is named here with the reason, and the user removes it
 * and asks again. Nothing is dropped behind their back.
 */
export function BookCodeButton({
  legs,
  remove,
  label = "Get SportyBet code",
}: {
  legs: SlipLeg[];
  /** Lets the user drop a pick that can't be booked. Omit where the picks are fixed. */
  remove?: (matchId: string) => void;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ stamp: string; value: Result } | null>(null);
  const stamp = stampOf(legs);
  const current = result?.stamp === stamp ? result.value : null;

  const book = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/slip/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: legs.map((l) => ({
            matchId: l.matchId,
            ...(legTeams(l) ?? {}),
            kickoff: l.kickoff,
            league: l.league,
            market: l.market,
            ...(l.eventId ? { eventId: l.eventId } : {}),
          })),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            code?: string;
            url?: string;
            deadline?: number;
            remaining?: number | null;
            swapped?: Swap[];
            problems?: { matchId: string; problem: LegProblem }[];
            error?: string;
            upgrade?: boolean;
            nextFreeAt?: number | null;
          }
        | null;
      let value: Result;
      if (body?.ok && body.code && body.url && body.deadline) {
        value = {
          kind: "code",
          code: body.code,
          url: body.url,
          deadline: body.deadline,
          remaining: body.remaining ?? null,
          swapped: body.swapped ?? [],
        };
      } else if (body?.problems?.length) {
        value = { kind: "problems", problems: body.problems };
      } else {
        value = {
          kind: "error",
          message: body?.error ?? "Couldn't get a code just now. Try again shortly.",
          upgrade: body?.upgrade,
          nextFreeAt: body?.nextFreeAt,
        };
      }
      setResult({ stamp, value });
    } catch {
      setResult({ stamp, value: { kind: "error", message: "No connection. Check your network and try again." } });
    } finally {
      setPending(false);
    }
  };

  if (current?.kind === "code") {
    return (
      <div className="space-y-2">
        <CodeBox code={current.code} />
        {current.swapped.map((s) => (
          <p key={s.matchId} className="text-[11px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">{legs.find((l) => l.matchId === s.matchId)?.fixture ?? "One pick"}</span>{" "}
            went on as {s.label}, SportyBet&rsquo;s name for the same bet on this game (same chance).
          </p>
        ))}
        <p className="text-[11px] leading-relaxed text-ink-dim">
          The code carries your picks, not prices: SportyBet shows its own odds at the moment you load it, and they move
          until kick-off.
        </p>
        <div className="flex items-center justify-between gap-3 text-[11px] text-ink-dim">
          <span>
            Loads until <LocalTime iso={new Date(current.deadline).toISOString()} kind="dayTime" />
          </span>
          <a href={current.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
            Open in SportyBet
          </a>
        </div>
        {current.remaining !== null && (
          <p className="text-[11px] text-ink-dim">
            {current.remaining === 0
              ? "That was your last code for this week."
              : `${current.remaining} ${current.remaining === 1 ? "code" : "codes"} left this week.`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button onClick={book} disabled={pending || legs.length === 0} className="w-full py-2.5">
        {pending && <Spinner className="size-3.5" />}
        {pending ? "Finding your picks on SportyBet…" : label}
      </Button>

      {current?.kind === "error" && (
        <div className="space-y-1 text-[11px]">
          <p className={current.upgrade || current.nextFreeAt ? "text-ink-muted" : "text-rose"}>{current.message}</p>
          {current.nextFreeAt && (
            <p className="text-ink-dim">
              Your next one frees up <LocalTime iso={new Date(current.nextFreeAt).toISOString()} kind="dayTime" />.
            </p>
          )}
          {current.upgrade && (
            <Link href="/pricing" className="inline-block font-semibold text-brand hover:underline">
              See plans →
            </Link>
          )}
        </div>
      )}

      {current?.kind === "problems" && (
        <div className="space-y-2 rounded-lg border border-amber/25 bg-amber/5 p-3">
          <p className="text-[11px] font-semibold text-ink">
            {current.problems.length === 1 ? "One pick" : `${current.problems.length} picks`} can&rsquo;t go on a code:
          </p>
          <ul className="space-y-1.5">
            {current.problems.map(({ matchId, problem }) => {
              const leg = legs.find((l) => l.matchId === matchId);
              return (
                <li key={matchId} className="flex items-start justify-between gap-2 text-[11px] text-ink-muted">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{leg?.fixture ?? matchId}</span>
                    {WHY[problem] ?? WHY["not-listed"]}
                  </span>
                  {leg && remove && (
                    <button
                      type="button"
                      onClick={() => remove(leg.matchId)}
                      className="shrink-0 rounded-md px-2 py-1 font-semibold text-rose hover:bg-rose/10"
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {remove && <p className="text-[11px] text-ink-dim">Remove them and tap the button again.</p>}
        </div>
      )}
    </div>
  );
}
