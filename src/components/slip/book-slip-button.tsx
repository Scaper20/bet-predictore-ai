"use client";

import { useState } from "react";
import { legTeams, useSlip, type SlipLeg } from "@/lib/slip";
import { Button } from "@/components/ui/primitives";

interface Booked {
  code: string;
  url: string | null;
  deadline: number | null;
  booked: number;
  skipped: { matchId: string; reason: string }[];
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; signature: string; booking: Booked }
  | { status: "error"; message: string };

const signatureOf = (legs: SlipLeg[]) =>
  legs.map((l) => `${l.matchId}|${l.market}`).sort().join(",");

const SKIP_TEXT: Record<string, string> = {
  "unsupported-market": "market not on SportyBet",
  "not-listed": "fixture not found on SportyBet",
  unavailable: "SportyBet wouldn't book it",
};

/**
 * "Get SportyBet booking code" for the slip.
 *
 * User-triggered, never automatic: each booking spends metered credits. The
 * code is stamped with the selections it was made for, so editing the slip
 * afterwards hides a code that no longer matches what is on screen.
 */
export function BookSlipButton() {
  const { legs } = useSlip();
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  if (legs.length === 0) return null;

  const signature = signatureOf(legs);
  const booking = state.status === "done" && state.signature === signature ? state.booking : null;

  async function book() {
    setState({ status: "loading" });
    setCopied(false);
    const payload = legs.flatMap((leg) => {
      const teams = legTeams(leg);
      return teams
        ? [{ matchId: leg.matchId, ...teams, kickoff: leg.kickoff, market: leg.market }]
        : [];
    });

    try {
      const res = await fetch("/api/slip/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs: payload }),
      });
      const body = (await res.json().catch(() => ({}))) as Booked & { error?: string };
      if (!res.ok || !body.code) {
        setState({ status: "error", message: body.error ?? "Couldn't get a booking code." });
        return;
      }
      setState({ status: "done", signature, booking: body });
    } catch {
      setState({ status: "error", message: "Couldn't reach the server. Check your connection." });
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  const nameOf = (matchId: string) => legs.find((l) => l.matchId === matchId)?.fixture ?? matchId;

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
        Bet on SportyBet
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
        Get a booking code and load this slip on SportyBet in one step. No stake is placed.
      </p>

      {booking ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-ink-dim">Booking code</p>
            <p className="tnum mt-1 font-display text-2xl font-extrabold tracking-widest text-brand">
              {booking.code}
            </p>
            <p className="mt-1 text-[11px] text-ink-dim">
              {booking.booked} {booking.booked === 1 ? "selection" : "selections"}
              {booking.deadline && <> · expires when the first match kicks off</>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" className="flex-1 py-2.5" onClick={() => copy(booking.code)}>
              {copied ? "Copied" : "Copy code"}
            </Button>
            {booking.url && (
              <a
                href={booking.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-center text-sm font-medium transition-colors hover:border-line-strong"
              >
                Open SportyBet
              </a>
            )}
          </div>
          {booking.skipped.length > 0 && (
            <div className="rounded-lg border border-amber/25 bg-amber/5 p-3">
              <p className="text-[11px] font-semibold text-ink">Not in this code</p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-ink-muted">
                {booking.skipped.map((s) => (
                  <li key={s.matchId}>
                    {nameOf(s.matchId)} — {SKIP_TEXT[s.reason] ?? s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          <Button
            type="button"
            className="mt-4 w-full py-2.5"
            disabled={state.status === "loading"}
            onClick={book}
          >
            {state.status === "loading" ? "Booking…" : "Get SportyBet booking code"}
          </Button>
          {state.status === "error" && (
            <p className="mt-2 text-[11px] leading-relaxed text-rose" role="alert">
              {state.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
