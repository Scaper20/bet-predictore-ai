"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Tier } from "@/lib/entitlements";
import { DAY_PASS_PATH, DAY_PASS_PRICE_NAIRA, formatLeft, type DayPassState } from "@/lib/day-pass";

const TIER_LABEL: Record<Tier, string> = { free: "Free", pass: "Pass", pro: "Pro", vip: "VIP" };

function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);
  return now;
}

/**
 * The account page's plan at a glance, in whichever of four states applies:
 * a running day pass (with its clock), the day-pass offer (with its clock),
 * a paid plan, or Free. One line of what it means and one button for what
 * to do next.
 */
export function PlanCard({ tier, dayPass, dayPassOnly }: { tier: Tier; dayPass: DayPassState; dayPassOnly: boolean }) {
  const now = useNow();
  const left = (iso: string) => (now === null ? null : formatLeft(Date.parse(iso) - now));

  if (dayPass.state === "active" && dayPassOnly) {
    return (
      <Shell
        tone="gold"
        label="VIP day pass"
        value={left(dayPass.until) ?? "VIP"}
        unit={now !== null ? "left" : undefined}
        note={<p className="text-xs text-ink-muted">Everything on the site is open. Keep it going after today:</p>}
        action={<Cta href="/account/billing?plan=vip" tone="gold">Keep VIP</Cta>}
      />
    );
  }
  if (dayPass.state === "offer") {
    return (
      <Shell
        tone="gold"
        label="New member offer"
        value={`VIP 24h · ₦${DAY_PASS_PRICE_NAIRA}`}
        note={
          <p className="text-xs text-ink-muted">
            Once, for your first day{left(dayPass.deadline) && <> · ends in <span className="tnum">{left(dayPass.deadline)}</span></>}
          </p>
        }
        action={<Cta href={DAY_PASS_PATH} tone="gold">Get it</Cta>}
      />
    );
  }
  if (tier !== "free") {
    return (
      <Shell
        tone="brand"
        label="Your plan"
        value={TIER_LABEL[tier]}
        note={<p className="text-xs text-ink-muted">Invoices, payment method and cancelling.</p>}
        action={<Cta href="/account/billing" tone="neutral">Manage plan</Cta>}
      />
    );
  }
  return (
    <Shell
      tone="brand"
      label="Your plan"
      value="Free"
      note={<p className="text-xs text-ink-muted">Pro-league picks before kick-off, every prediction type, every combo.</p>}
      action={<Cta href="/pricing" tone="brand">See Pro &amp; VIP</Cta>}
    />
  );
}

function Shell({
  tone,
  label,
  value,
  unit,
  note,
  action,
}: {
  tone: "gold" | "brand";
  label: string;
  value: string;
  unit?: string;
  note: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className={`card relative overflow-hidden p-5 sm:p-6 ${tone === "gold" ? "border-gold/35" : ""}`}>
      {tone === "gold" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_100%_0%,color-mix(in_oklab,var(--color-gold)_16%,transparent),transparent_70%)]" />
      )}
      <div className="relative flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] ${tone === "gold" ? "text-gold" : "text-brand"}`}>{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
            {value}
            {unit && <span className="ml-1.5 text-sm font-medium text-ink-dim">{unit}</span>}
          </p>
          <div className="mt-1">{note}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

function Cta({ href, tone, children }: { href: string; tone: "gold" | "brand" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "gold"
      ? "bg-gold text-gold-ink hover:bg-gold-strong"
      : tone === "brand"
        ? "bg-brand text-brand-ink hover:bg-brand-strong"
        : "border border-line bg-surface-2 text-ink hover:border-line-strong";
  return (
    <Link href={href} className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-5 text-sm font-bold transition-colors ${cls}`}>
      {children}
    </Link>
  );
}
