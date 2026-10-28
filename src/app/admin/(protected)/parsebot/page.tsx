import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { SwitchForm } from "@/components/admin/switch-form";
import { switchesFresh } from "@/lib/switches";
import { capsFrom, CREDIT_COST } from "@/lib/odds/parsebot-budget";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin";

export const metadata: Metadata = { title: "parse.bot and Code Hub" };
export const dynamic = "force-dynamic";

interface Call {
  endpoint: string;
  credits: number;
  ok: boolean | null;
  note: string | null;
  at: string;
}

async function usage() {
  const db = supabaseAdmin();
  const lagosMidnight = new Date(
    Date.parse(`${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })}T00:00:00+01:00`),
  ).toISOString();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [window, recent, waitlist, codes] = await Promise.all([
    db.from("parsebot_calls").select("credits, at").gte("at", since30),
    db.from("parsebot_calls").select("endpoint, credits, ok, note, at").order("at", { ascending: false }).limit(15),
    db.from("code_hub_waitlist").select("id", { count: "exact", head: true }),
    db.from("code_hub_codes").select("day, booking_code").order("day", { ascending: false }).limit(25),
  ]);
  const rows = (window.data ?? []) as { credits: number; at: string }[];
  const today = rows.filter((r) => r.at >= lagosMidnight).reduce((n, r) => n + r.credits, 0);
  const month = rows.reduce((n, r) => n + r.credits, 0);
  const booked = (codes.data ?? []).filter((c) => c.booking_code).length;
  return {
    today,
    month,
    recent: (recent.data ?? []) as Call[],
    waitlist: waitlist.count ?? 0,
    hubDays: new Set((codes.data ?? []).map((c) => c.day)).size,
    booked,
    tablesMissing: Boolean(window.error),
  };
}

export default async function AdminParsebotPage() {
  await requirePermission("codehub.manage");
  const [sw, u] = await Promise.all([switchesFresh(), usage()]);
  const caps = capsFrom(process.env);
  const keySet = Boolean(process.env.PARSEBOT_API_KEY?.trim());
  const hardOff = process.env.PARSEBOT_LIVE?.trim() === "off";
  const live = sw.parsebot_live.enabled && keySet && !hardOff;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">Product</p>
        <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">parse.bot and Code Hub</h1>
        <p className="mt-1 text-sm text-ink-muted">
          SportyBet prices and booking codes come straight from SportyBet (see{" "}
          <Link href="/admin/sportybet" className="text-brand hover:underline">SportyBet matching</Link>). parse.bot, paid per
          call, is only the fallback for when that is off or refused. Nothing is spent while this switch is off. With it
          on, every call is still held to the daily and 30-day caps below.
        </p>
      </div>

      <section className="card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">parse.bot calls</h2>
          {live ? (
            <Badge tone="brand">Live: spending credits</Badge>
          ) : sw.parsebot_live.enabled ? (
            <Badge tone="amber">Switched on, but blocked</Badge>
          ) : (
            <Badge>Off</Badge>
          )}
        </div>

        <ul className="space-y-1.5 text-sm">
          <Check ok={keySet} yes="API key is set in Vercel" no="No API key: set PARSEBOT_API_KEY in Vercel first" />
          <Check ok={!hardOff} yes="No hard stop in the environment" no="PARSEBOT_LIVE=off in Vercel overrides this switch" />
          <Check ok={!u.tablesMissing} yes="Credit ledger is in place" no="Credit ledger table is missing" />
        </ul>

        <div className="grid grid-cols-2 gap-3">
          <Meter label="Today (Lagos)" used={u.today} cap={caps.daily} />
          <Meter label="Last 30 days" used={u.month} cap={caps.window} />
        </div>
        <p className="text-xs text-ink-dim">
          A booking code costs {CREDIT_COST.book_bet} credits; a SportyBet price board costs{" "}
          {CREDIT_COST.get_upcoming_events}. Caps change with PARSEBOT_DAILY_CREDITS and PARSEBOT_WINDOW_CREDITS.
        </p>

        <SwitchForm
          switchKey="parsebot_live"
          enabled={sw.parsebot_live.enabled}
          onLabel="Turn parse.bot on"
          offLabel="Turn parse.bot off"
          confirmOn="Start spending parse.bot credits? Calls stay inside the daily and 30-day caps."
          disabled={!keySet || hardOff}
        />
        {sw.parsebot_live.updatedAt && <Changed at={sw.parsebot_live.updatedAt} />}
      </section>

      <section className="card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Code Hub</h2>
          {sw.code_hub_open.enabled ? <Badge tone="brand">Open to everyone</Badge> : <Badge tone="amber">Waitlist</Badge>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="On the waitlist" value={u.waitlist} />
          <Stat label="Days published" value={u.hubDays} />
          <Stat label="Codes booked" value={u.booked} />
        </div>
        <p className="text-xs text-ink-dim">
          While the hub is on its waitlist, visitors see the sign-up wall and admins see the real page. Opening it
          without parse.bot on shows the combos with &ldquo;code coming&rdquo; in place of each code.
        </p>
        <SwitchForm
          switchKey="code_hub_open"
          enabled={sw.code_hub_open.enabled}
          onLabel="Open the Code Hub"
          offLabel="Put the Code Hub back behind the waitlist"
          confirmOn="Open the Code Hub to every visitor?"
        />
        {sw.code_hub_open.updatedAt && <Changed at={sw.code_hub_open.updatedAt} />}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Recent calls</h2>
        {u.recent.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-muted">No calls yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {u.recent.map((c, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-36 shrink-0 font-mono text-xs text-ink-dim">
                  {new Date(c.at).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Lagos" })}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {c.endpoint}
                  {c.note && <span className="text-ink-dim"> · {c.note}</span>}
                </span>
                <span className="font-mono text-xs text-ink-muted">{c.credits} cr</span>
                <span className={`w-10 text-right text-xs ${c.ok === false ? "text-rose" : "text-brand"}`}>
                  {c.ok === null ? "…" : c.ok ? "ok" : "fail"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Check({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-ink-muted" : "text-amber"}`}>
      <span className="font-bold">{ok ? "✓" : "!"}</span>
      {ok ? yes : no}
    </li>
  );
}

function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-1 font-mono text-lg">
        {used} <span className="text-sm text-ink-dim">/ {cap} credits</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${pct >= 80 ? "bg-amber" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}

function Changed({ at }: { at: string }) {
  return (
    <p className="text-xs text-ink-dim">
      Last changed {new Date(at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}
    </p>
  );
}
