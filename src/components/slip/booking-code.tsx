"use client";

import { useState } from "react";
import { legTeams, useSlip } from "@/lib/slip";
import { AccountGate } from "@/components/entitlements/account-gate";
import { Button, Spinner } from "@/components/ui/primitives";

/**
 * A real SportyBet booking code for the current slip, produced server-side by
 * automating SportyBet's own bet-slip builder — see
 * src/lib/booking/sportybet-booking.ts for what that actually does and why it
 * can fail. This is a live, best-effort automation against a third party's
 * site, not a guaranteed feature: every non-success reason below is a normal
 * outcome to design for, not a bug to fix.
 */
type Result =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "code"; code: string }
  | { state: "unavailable"; fixtures: string[] }
  | { state: "failed"; reason: string };

const REASON_COPY: Record<string, string> = {
  disabled: "Booking codes aren't turned on for this deployment yet.",
  blocked: "SportyBet declined the automated request just now. Try again shortly.",
  timeout: "SportyBet took too long to respond. Try again shortly.",
  not_found: "Couldn't complete the booking on SportyBet's site — the selections may have moved.",
  error: "Something went wrong generating the code. Try again shortly.",
};

export function BookingCode() {
  const { legs } = useSlip();
  const [result, setResult] = useState<Result>({ state: "idle" });
  const [copied, setCopied] = useState(false);

  if (legs.length === 0) return null;

  async function generate() {
    setResult({ state: "pending" });
    setCopied(false);
    try {
      const payload = legs.flatMap((leg) => {
        const teams = legTeams(leg);
        if (!teams) return [];
        return [
          {
            homeName: teams.homeName,
            awayName: teams.awayName,
            kickoff: leg.kickoff,
            league: leg.league,
            market: leg.market,
            label: leg.label,
          },
        ];
      });

      const res = await fetch("/api/slip/booking-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs: payload }),
      });
      const body = (await res.json().catch(() => null)) as
        | { code: string }
        | { code: null; reason: string; unavailable?: string[] }
        | null;

      if (!body || body.code === null) {
        const reason = body?.reason ?? "error";
        if (reason === "unavailable_on_sportybet") {
          setResult({ state: "unavailable", fixtures: body?.unavailable ?? [] });
        } else {
          setResult({ state: "failed", reason });
        }
      } else {
        setResult({ state: "code", code: body.code });
      }
    } catch {
      setResult({ state: "failed", reason: "error" });
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — the code is still visible and selectable below.
    }
  }

  return (
    <AccountGate reason="Sign in to generate a SportyBet booking code for this slip.">
      <section className="card p-5 sm:p-6">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
            SportyBet booking code
          </h2>
          <span className="shrink-0 text-xs text-ink-dim">Best effort</span>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-ink-dim">
          Builds this exact slip on SportyBet and hands back the code their own booking box
          accepts. This automates SportyBet&apos;s public site rather than reading an official
          feed, so it can occasionally fail or be temporarily unavailable — when it is, add the
          selections yourself the usual way.
        </p>

        {result.state !== "code" && (
          <Button
            type="button"
            onClick={() => void generate()}
            disabled={result.state === "pending"}
            className="w-full"
          >
            {result.state === "pending" && <Spinner className="size-4" />}
            {result.state === "pending" ? "Booking on SportyBet…" : "Get booking code"}
          </Button>
        )}

        {result.state === "code" && (
          <div className="rounded-lg border border-brand/25 bg-brand/5 p-4">
            <p className="text-[10px] uppercase tracking-wider text-ink-dim">Booking code</p>
            <p className="tnum mt-1 text-2xl font-extrabold tracking-widest">{result.code}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void copy(result.code)} className="py-2">
                {copied ? "Copied ✓" : "Copy code"}
              </Button>
              <Button variant="ghost" onClick={() => setResult({ state: "idle" })} className="py-2">
                Generate again
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
              Enter this in SportyBet&apos;s own booking-code box to load these selections. Always
              check the price and selections it loads before staking — a price can move between
              booking and staking.
            </p>
          </div>
        )}

        {result.state === "unavailable" && (
          <p className="mt-3 text-xs leading-relaxed text-rose">
            Not booked — {result.fixtures.length === 1 ? "this selection isn't" : "these selections aren't"}{" "}
            currently listed on SportyBet: {result.fixtures.join(", ")}. A partial code would load a
            different slip than the one shown here, so nothing was generated.
          </p>
        )}

        {result.state === "failed" && (
          <p className="mt-3 text-xs text-rose">
            {REASON_COPY[result.reason] ?? REASON_COPY.error}
          </p>
        )}
      </section>
    </AccountGate>
  );
}
