"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/primitives";
import { DAY_PASS_PRICE_NAIRA, formatLeft } from "@/lib/day-pass";

/** The pay button on /vip/day-pass, with the offer's countdown. */
export function DayPassCheckout({ deadline }: { deadline: string }) {
  const [now, setNow] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  async function pay() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/day-pass", { method: "POST" });
      const data = (await res.json()) as { authorization_url?: string; error?: string };
      if (data.authorization_url) return window.location.assign(data.authorization_url);
      setError(data.error ?? "Couldn't start checkout. Try again.");
    } catch {
      setError("Couldn't start checkout. Try again.");
    }
    setPending(false);
  }

  return (
    <div className="mt-6 space-y-2">
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 text-sm font-bold text-gold-ink transition-colors hover:bg-gold-strong disabled:opacity-70"
      >
        {pending && <Spinner className="size-4" />}
        {pending ? "Opening checkout…" : `Pay ₦${DAY_PASS_PRICE_NAIRA.toLocaleString("en-NG")}`}
      </button>
      {error && <p className="text-center text-xs text-rose">{error}</p>}
      <p className="text-center text-[11px] text-ink-dim">
        Transfer, OPay, PalmPay, USSD or card
        {now !== null && <> · offer ends in <span className="tnum">{formatLeft(Date.parse(deadline) - now)}</span></>}
      </p>
    </div>
  );
}
