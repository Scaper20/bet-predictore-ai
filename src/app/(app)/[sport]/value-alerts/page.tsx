import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { containerClass } from "@/components/ui/container";
import { getEntitlement, meets } from "@/lib/entitlements";
import { activeAlerts, latestScan, runValueScan, type ValueAlert } from "@/lib/value-alerts";
import { scanDue, STALE_AFTER_MS } from "@/lib/value-alert-rules";
import { odds, percent } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import { matchPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Value-Shift Alerts",
  description:
    "VIP alerts for the rare moments a SportyBet price moves above fair value, measured against " +
    "the bookmaker consensus with the margin taken out.",
  alternates: { canonical: "/football/value-alerts" },
};

// Per-viewer (the VIP check reads the session), and a background rescan may
// run after the response — give it room.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ValueAlertsPage() {
  const entitlement = await getEntitlement();
  const vip = meets(entitlement.tier, "vip");

  return (
    <>
      <PageHeader
        eyebrow="VIP"
        title="Value-shift alerts"
        description="Prices that move in your favour."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        {vip ? <AlertsBody /> : <Upsell signedIn={entitlement.signedIn} />}
      </div>
    </>
  );
}

async function AlertsBody() {
  const [scan, alerts] = await Promise.all([latestScan(), activeAlerts()]);

  // Stale-while-revalidate: show what we have now, rescan after responding so
  // the next visit is fresh. The daily cron alone would leave this a day old.
  if (scanDue(scan)) {
    after(() => runValueScan("page").catch((err) => console.error("value scan failed:", err)));
  }

  const checked = scan?.finishedAt ?? scan?.startedAt;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-dim">
        <Badge tone="violet">VIP</Badge>
        <span>
          {checked ? (
            <>
              Last checked <LocalTime iso={new Date(checked).toISOString()} />
              {scan?.fixtures != null ? ` across ${scan.fixtures} fixtures` : ""}.
            </>
          ) : (
            "First scan is running now."
          )}{" "}
          Rechecked every {Math.round(STALE_AFTER_MS / 60_000)} minutes while you use this page; new alerts are also emailed each morning.
        </span>
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          icon="📉"
          title="No value prices right now"
          description="Nothing right now. We'll email you when there is."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {alerts.map((a) => (
            <AlertCard key={`${a.matchId}|${a.market}`} alert={a} />
          ))}
        </div>
      )}

      <p className="max-w-2xl text-xs leading-relaxed text-ink-dim">
        &ldquo;Vs market&rdquo; means SportyBet&apos;s price is longer than what the bookmaker consensus
        makes it once their margin is removed. That needs no faith in our model. &ldquo;Vs model&rdquo;
        appears only where no consensus exists, and only for edges above the model&apos;s own error
        bars. Prices move constantly; confirm the price before you stake. You can turn the email off
        from your <Link href="/account" className="underline underline-offset-2">account</Link>.
      </p>
    </>
  );
}

function AlertCard({ alert: a }: { alert: ValueAlert }) {
  return (
    <Link href={matchPath(a.matchId)} className="card card-hover block p-5">
      <div className="flex items-center justify-between gap-3 text-xs text-ink-dim">
        <span className="truncate">{a.leagueName}</span>
        <span className="shrink-0">
          <LocalTime iso={a.kickoff} kind="relative" /> · <LocalTime iso={a.kickoff} />
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold">
        {a.homeName} vs {a.awayName}
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-base font-bold text-brand">{a.label}</p>
          <p className="tnum text-xs text-ink-muted">
            SportyBet {odds(a.localPrice)} · model {percent(a.probability)}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum font-display text-2xl font-extrabold text-brand">+{(a.edge * 100).toFixed(1)}%</p>
          <p className="text-[11px] text-ink-dim">{a.benchmark === "market" ? "vs market" : "vs model"}</p>
        </div>
      </div>
      <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">{a.reason}</p>
    </Link>
  );
}

function Upsell({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="card mx-auto max-w-xl space-y-4 p-6 text-center sm:p-8">
      <span className="text-3xl" aria-hidden>🔔</span>
      <h2 className="font-display text-xl font-bold">Get told when a price goes long</h2>
      <p className="text-sm leading-relaxed text-ink-muted">
        We scan SportyBet&apos;s prices on every modelled fixture in the next two days against the
        consensus of up to 25 bookmakers. When one moves above fair value, VIP members see it here and
        get it by email the next morning.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/account/billing?plan=vip">Go VIP</ButtonLink>
        {!signedIn && (
          <ButtonLink href="/account/login?next=/football/value-alerts" variant="secondary">
            Sign in
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
