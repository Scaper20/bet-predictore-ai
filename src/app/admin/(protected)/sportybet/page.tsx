import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { SportyBetForm } from "@/components/admin/sportybet-forms";
import { SwitchForm } from "@/components/admin/switch-form";
import { LEAGUES, leagueByCode } from "@/lib/leagues";
import { directHealth } from "@/lib/odds/sportybet-direct";
import { TRUST_MIN_SHARE, TRUST_MIN_VOTES } from "@/lib/odds/sportybet-discover";
import { allSportyBetTournaments, tournamentRows } from "@/lib/odds/sportybet-links";
import type { Candidate } from "@/lib/odds/sportybet-match";
import { shareLink } from "@/lib/odds/sportybet-api";
import { matchPath } from "@/lib/routes";
import { switchesFresh } from "@/lib/switches";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "SportyBet matching" };
export const dynamic = "force-dynamic";

interface Unresolved {
  match_id: string;
  league_code: string;
  home_name: string;
  away_name: string;
  kickoff: string;
  candidates: Candidate[];
}

interface Competitor {
  league_code: string;
  team_key: string;
  team_name: string;
  sportybet_name: string;
  competitor_id: string;
  method: string;
  status: string;
  confirmations: number;
  last_seen: string;
}

const when = (iso: string | number) =>
  new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

async function load() {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const [links, unresolved, review] = await Promise.all([
    db.from("sportybet_event_links").select("league_code, method").gte("kickoff", now),
    db
      .from("sportybet_unresolved")
      .select("match_id, league_code, home_name, away_name, kickoff, candidates")
      .gte("kickoff", now)
      .order("kickoff")
      .limit(60),
    db
      .from("sportybet_competitors")
      .select("league_code, team_key, team_name, sportybet_name, competitor_id, method, status, confirmations, last_seen")
      .neq("status", "rejected")
      .in("method", ["anchor", "elimination", "manual"])
      .order("last_seen", { ascending: false })
      .limit(60),
  ]);
  const byLeague = new Map<string, Record<string, number>>();
  for (const r of (links.data ?? []) as { league_code: string; method: string }[]) {
    const m = byLeague.get(r.league_code) ?? {};
    m[r.method] = (m[r.method] ?? 0) + 1;
    byLeague.set(r.league_code, m);
  }
  const unresolvedRows = (unresolved.data ?? []) as Unresolved[];
  const openByLeague = new Map<string, number>();
  for (const u of unresolvedRows) openByLeague.set(u.league_code, (openByLeague.get(u.league_code) ?? 0) + 1);
  return {
    tablesMissing: Boolean(links.error),
    byLeague,
    openByLeague,
    unresolved: unresolvedRows,
    review: (review.data ?? []) as Competitor[],
  };
}

const METHODS = ["id", "name", "anchor", "elimination", "manual"] as const;

interface Mismatch {
  match_id: string;
  league_code: string;
  home_name: string;
  away_name: string;
  kickoff: string;
  our_score: string | null;
  sportybet_score: string | null;
}

interface Booking {
  at: string;
  source: string;
  legs: number;
  outcome: string;
  via: string | null;
  code: string | null;
  read_back: boolean | null;
  duration_ms: number | null;
}

/** Ground truth: links checked against final scores, and every booking attempt. */
/** What has to be true before the Code Hub opens to everyone. */
async function launchState() {
  const db = supabaseAdmin();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const [codes, tournaments] = await Promise.all([
    db.from("code_hub_codes").select("tier, booking_code").eq("day", day),
    allSportyBetTournaments(),
  ]);
  const rows = (codes.data ?? []) as { tier: string; booking_code: string | null }[];
  return { built: rows.length, booked: rows.filter((r) => r.booking_code).length, competitions: tournaments.size };
}

async function proof() {
  const db = supabaseAdmin();
  const now = Date.now();
  const [links, mismatches, bookings] = await Promise.all([
    db
      .from("sportybet_event_links")
      .select("method, verdict")
      .gte("kickoff", new Date(now - 30 * 86_400_000).toISOString())
      .lt("kickoff", new Date(now).toISOString()),
    db
      .from("sportybet_event_links")
      .select("match_id, league_code, home_name, away_name, kickoff, our_score, sportybet_score")
      .eq("verdict", "mismatch")
      .order("kickoff", { ascending: false })
      .limit(20),
    db
      .from("sportybet_booking_log")
      .select("at, source, legs, outcome, via, code, read_back, duration_ms")
      .gte("at", new Date(now - 7 * 86_400_000).toISOString())
      .order("at", { ascending: false })
      .limit(500),
  ]);

  const byMethod = new Map<string, { confirmed: number; mismatch: number; noResult: number; pending: number }>();
  for (const r of (links.data ?? []) as { method: string; verdict: string | null }[]) {
    const m = byMethod.get(r.method) ?? { confirmed: 0, mismatch: 0, noResult: 0, pending: 0 };
    if (r.verdict === "confirmed") m.confirmed++;
    else if (r.verdict === "mismatch") m.mismatch++;
    else if (r.verdict === "no-result") m.noResult++;
    else m.pending++;
    byMethod.set(r.method, m);
  }
  const totals = [...byMethod.values()].reduce(
    (t, m) => ({ confirmed: t.confirmed + m.confirmed, mismatch: t.mismatch + m.mismatch, pending: t.pending + m.pending }),
    { confirmed: 0, mismatch: 0, pending: 0 },
  );

  const rows = (bookings.data ?? []) as Booking[];
  const booked = rows.filter((b) => b.outcome === "booked" || b.outcome === "cached");
  const fresh = rows.filter((b) => b.outcome === "booked");
  const durations = booked.map((b) => b.duration_ms).filter((d): d is number => typeof d === "number").sort((a, b) => a - b);
  return {
    missing: Boolean(links.error || bookings.error),
    byMethod,
    totals,
    accuracy: totals.confirmed + totals.mismatch > 0 ? totals.confirmed / (totals.confirmed + totals.mismatch) : null,
    mismatches: (mismatches.data ?? []) as Mismatch[],
    bookings: {
      attempts: rows.length,
      booked: booked.length,
      direct: fresh.filter((b) => b.via === "direct").length,
      parsebot: fresh.filter((b) => b.via === "parsebot").length,
      cached: rows.filter((b) => b.outcome === "cached").length,
      problems: rows.filter((b) => b.outcome === "problems").length,
      refused: rows.filter((b) => b.outcome === "refused" || b.outcome === "unavailable").length,
      readBackOk: fresh.filter((b) => b.read_back === true).length,
      readBackChecked: fresh.filter((b) => b.read_back !== null).length,
      medianMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      recent: booked.filter((b) => b.code).slice(0, 10),
    },
  };
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "–");

export default async function AdminSportyBetPage() {
  const [sw, data, rows, p, launch] = await Promise.all([switchesFresh(), load(), tournamentRows(), proof(), launchState()]);
  const hardOff = process.env.SPORTYBET_DIRECT?.trim() === "off";
  const health = directHealth();
  const found = new Map(rows.map((r) => [r.league_code, r]));
  const linked = LEAGUES.filter((l) => l.ids.sportyBet || found.get(l.code)?.status === "trusted");

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">SportyBet matching</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Prices and booking codes come straight from SportyBet. Each of our fixtures is matched to SportyBet&rsquo;s
          event once and remembered. Clubs are learned by their Sportradar id, so a club matched once is never matched
          by name again. What the matcher couldn&rsquo;t settle on its own is listed below.
        </p>
      </div>

      <section className="card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Code Hub launch checklist</h2>
          {sw.code_hub_open.enabled ? <Badge tone="brand">Open to everyone</Badge> : <Badge tone="amber">Waitlist</Badge>}
        </div>
        <ul className="space-y-1.5 text-sm">
          <LaunchCheck
            ok={sw.sportybet_direct.enabled && !hardOff && !(health.failedAt && (!health.okAt || health.failedAt > health.okAt))}
            text="SportyBet direct is on and answering"
          />
          <LaunchCheck ok={launch.competitions >= 20} text={`${launch.competitions} competitions linked to SportyBet`} />
          <LaunchCheck
            ok={launch.built > 0 && launch.booked === launch.built}
            text={`Today's hub codes booked: ${launch.booked} of ${launch.built}`}
          />
          <LaunchCheck
            ok={p.bookings.attempts === 0 || p.bookings.booked / Math.max(1, p.bookings.attempts - p.bookings.problems) >= 0.9}
            text={`Bookings this week: ${p.bookings.booked} codes from ${p.bookings.attempts} attempts`}
          />
          <LaunchCheck ok={p.totals.mismatch === 0} text={`Links confirmed by final score: ${p.totals.confirmed}, mismatched: ${p.totals.mismatch}`} />
        </ul>
        <p className="text-xs text-ink-dim">
          When every line is green, open the hub from{" "}
          <Link href="/admin/parsebot" className="text-brand hover:underline">
            parse.bot &amp; Code Hub
          </Link>
          . Preview builds already show the open hub for checking.
        </p>
      </section>

      <section className="card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Proof: links checked against final scores</h2>
            <p className="mt-1 text-xs text-ink-dim">
              After full time, SportyBet&rsquo;s score for each linked event is compared with ours. A wrong link would
              show a different score. Last 30 days.
            </p>
          </div>
          {p.accuracy === null ? (
            <Badge>Waiting for results</Badge>
          ) : (
            <Badge tone={p.totals.mismatch === 0 ? "brand" : "amber"}>
              {(p.accuracy * 100).toFixed(1)}% confirmed ({p.totals.confirmed} of {p.totals.confirmed + p.totals.mismatch})
            </Badge>
          )}
        </div>
        {p.missing && <p className="text-xs text-amber">Migration 0067 hasn&rsquo;t been applied yet.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Method</th>
                <th className="py-1.5 pr-3 text-right font-medium">Confirmed</th>
                <th className="py-1.5 pr-3 text-right font-medium">Mismatch</th>
                <th className="py-1.5 pr-3 text-right font-medium">No result</th>
                <th className="py-1.5 text-right font-medium">Not checked yet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-xs">
              {METHODS.filter((m) => p.byMethod.has(m)).map((m) => {
                const r = p.byMethod.get(m)!;
                return (
                  <tr key={m}>
                    <td className="py-1.5 pr-3 font-sans">{m}</td>
                    <td className="py-1.5 pr-3 text-right text-brand">{r.confirmed}</td>
                    <td className={`py-1.5 pr-3 text-right ${r.mismatch ? "text-rose" : ""}`}>{r.mismatch}</td>
                    <td className="py-1.5 pr-3 text-right">{r.noResult}</td>
                    <td className="py-1.5 text-right text-ink-dim">{r.pending}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {p.byMethod.size === 0 && <p className="py-2 text-xs text-ink-muted">No linked game has kicked off yet.</p>}
        </div>
        <SportyBetForm action="verify" fields={{}}>
          Check finished games now
        </SportyBetForm>

        {p.mismatches.length > 0 && (
          <div className="space-y-2 border-t border-line pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rose">Mismatches</h3>
            <ul className="divide-y divide-line text-sm">
              {p.mismatches.map((m) => (
                <li key={m.match_id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <Link href={matchPath(m.match_id)} className="font-semibold hover:text-brand">
                      Our {m.our_score ?? "?"}
                    </Link>{" "}
                    vs SportyBet&rsquo;s {m.home_name} {m.sportybet_score ?? "?"} {m.away_name}
                    <span className="text-xs text-ink-dim">
                      {" "}
                      · {leagueByCode(m.league_code)?.name ?? m.league_code} · {when(m.kickoff)}
                    </span>
                  </span>
                  <SportyBetForm action="unlink" variant="danger" fields={{ matchId: m.match_id }}>
                    Unlink and re-learn
                  </SportyBetForm>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold text-ink">Proof: booking codes</h2>
          <p className="mt-1 text-xs text-ink-dim">
            Every attempt from the slip and the Code Hub, last 7 days. A direct code is read back from SportyBet before
            it is shown, and refused if a pick went missing.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Attempts" value={String(p.bookings.attempts)} />
          <Stat label="Codes given" value={`${p.bookings.booked} (${pct(p.bookings.booked, p.bookings.attempts)})`} />
          <Stat
            label="Read back OK"
            value={`${p.bookings.readBackOk} of ${p.bookings.readBackChecked}`}
          />
          <Stat label="Median time" value={p.bookings.medianMs === null ? "–" : `${(p.bookings.medianMs / 1000).toFixed(1)} s`} />
        </div>
        <p className="text-xs text-ink-dim">
          New codes: {p.bookings.direct} direct, {p.bookings.parsebot} via parse.bot · {p.bookings.cached} reused from
          cache · {p.bookings.problems} stopped by a pick that couldn&rsquo;t be booked · {p.bookings.refused} refused or
          unavailable
        </p>
        {p.bookings.recent.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {p.bookings.recent.map((b, i) => (
              <li key={`${b.code}-${i}`} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-36 shrink-0 font-mono text-xs text-ink-dim">{when(b.at)}</span>
                <span className="font-mono font-semibold tracking-wider">{b.code}</span>
                <span className="min-w-0 flex-1 text-xs text-ink-muted">
                  {b.legs} picks · {b.source} · {b.outcome === "cached" ? "reused" : b.via}
                  {b.read_back === true && " · read back ✓"}
                </span>
                <a
                  href={shareLink(b.code!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Open in SportyBet
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Direct connection</h2>
          {hardOff ? (
            <Badge tone="rose">SPORTYBET_DIRECT=off</Badge>
          ) : !sw.sportybet_direct.enabled ? (
            <Badge>Off</Badge>
          ) : health.failedAt && (!health.okAt || health.failedAt > health.okAt) ? (
            <Badge tone="amber">On, last call failed: {health.reason}</Badge>
          ) : (
            <Badge tone="brand">On</Badge>
          )}
        </div>
        <p className="text-xs text-ink-dim">
          Free, and polite: boards are stored for every server and refreshed every 30 minutes close to kickoff,
          3 hours otherwise. With this off, prices come from stored boards, or from parse.bot if that is on.
          {health.okAt && <> Last answered on this server {when(health.okAt)}.</>}
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <SwitchForm
            switchKey="sportybet_direct"
            enabled={sw.sportybet_direct.enabled}
            onLabel="Turn SportyBet direct on"
            offLabel="Turn SportyBet direct off"
            disabled={hardOff}
          />
          <SportyBetForm action="sync" fields={{}} variant="primary">
            Match all competitions now
          </SportyBetForm>
        </div>
        {data.tablesMissing && <p className="text-xs text-amber">Migration 0066 hasn&rsquo;t been applied yet.</p>}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Upcoming fixtures matched</h2>
        <ul className="divide-y divide-line text-sm">
          {linked.map((l) => {
            const m = data.byLeague.get(l.code) ?? {};
            const total = Object.values(m).reduce((a, b) => a + b, 0);
            const open = data.openByLeague.get(l.code) ?? 0;
            return (
              <li key={l.code} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="font-mono text-xs text-ink-muted">
                  {total} linked
                  {Object.entries(m).map(([k, v]) => ` · ${k} ${v}`).join("")}
                </span>
                {open > 0 && <Badge tone="amber">{open} to settle</Badge>}
                <SportyBetForm action="sync" fields={{ league: l.code }}>
                  Re-match
                </SportyBetForm>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Fixtures to settle by hand</h2>
        {data.unresolved.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-muted">Nothing waiting. Every listed fixture was matched.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.unresolved.map((u) => (
              <li key={u.match_id} className="space-y-2 px-5 py-3">
                <p>
                  <span className="font-semibold">
                    {u.home_name} v {u.away_name}
                  </span>{" "}
                  <span className="text-xs text-ink-dim">
                    · {leagueByCode(u.league_code)?.name ?? u.league_code} · {when(u.kickoff)}
                  </span>
                </p>
                <ul className="space-y-1.5">
                  {u.candidates.map((c) => (
                    <li key={c.eventId} className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                      <span className="min-w-0 flex-1">
                        {c.homeName} v {c.awayName} · {when(c.kickoff)}{" "}
                        <span className="font-mono text-ink-dim">({Math.round(c.score * 100)}% alike)</span>
                      </span>
                      <SportyBetForm action="link" fields={{ matchId: u.match_id, eventId: c.eventId }}>
                        This is it
                      </SportyBetForm>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Clubs learned without a name match</h2>
        <p className="border-b border-line px-5 py-2 text-xs text-ink-dim">
          Pending links aren&rsquo;t used until they are seen again or approved. Rejecting one stops it being learned
          again and re-matches the fixtures that may have relied on it.
        </p>
        {data.review.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.review.map((c) => (
              <li key={`${c.league_code}:${c.team_key}:${c.competitor_id}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{c.team_name}</span>
                  <span className="text-ink-dim"> = </span>
                  {c.sportybet_name}
                  <span className="text-xs text-ink-dim">
                    {" "}
                    · {leagueByCode(c.league_code)?.name ?? c.league_code} · {c.method} · seen {c.confirmations}×
                  </span>
                </span>
                {c.status === "pending" ? <Badge tone="amber">Pending</Badge> : <Badge>Trusted</Badge>}
                {c.status === "pending" && (
                  <SportyBetForm
                    action="judge"
                    fields={{ league: c.league_code, teamKey: c.team_key, competitorId: c.competitor_id, intent: "approve" }}
                  >
                    Approve
                  </SportyBetForm>
                )}
                <SportyBetForm
                  action="judge"
                  variant="danger"
                  fields={{ league: c.league_code, teamKey: c.team_key, competitorId: c.competitor_id, intent: "reject" }}
                >
                  Reject
                </SportyBetForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">Competitions on SportyBet</h2>
          <SportyBetForm action="discover" fields={{}}>
            Find competitions now
          </SportyBetForm>
        </div>
        <p className="border-b border-line px-5 py-2 text-xs text-ink-dim">
          A competition without a hand-set id is found from evidence: its own upcoming fixtures are matched against
          SportyBet&rsquo;s whole board, and the tournament they are found in wins. Clear wins (at least{" "}
          {TRUST_MIN_VOTES} fixtures, {Math.round(TRUST_MIN_SHARE * 100)}% of the votes) are used straight away; close
          ones wait here. Runs daily, and finds a competition again once it has fixtures.
        </p>
        <ul className="divide-y divide-line text-sm">
          {LEAGUES.map((l) => {
            const row = found.get(l.code);
            return (
              <li key={l.code} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{l.name}</span>
                  <span className="block font-mono text-xs text-ink-muted">
                    {l.ids.sportyBet
                      ? `${l.ids.sportyBet} · hand-set`
                      : row
                        ? `${row.tournament_id} ${row.category} / ${row.tournament_name} · ${row.votes} of ${row.fixtures} fixtures` +
                          (row.runner_up_votes ? ` (next best ${row.runner_up_votes})` : "")
                        : "not found yet: no fixtures on SportyBet, or none upcoming"}
                  </span>
                </span>
                {l.ids.sportyBet ? (
                  <Badge tone="brand">Hand-set</Badge>
                ) : row?.status === "trusted" ? (
                  <Badge tone="brand">Found</Badge>
                ) : row?.status === "pending" ? (
                  <Badge tone="amber">Check</Badge>
                ) : row?.status === "rejected" ? (
                  <Badge tone="rose">Rejected</Badge>
                ) : (
                  <Badge>None</Badge>
                )}
                {!l.ids.sportyBet && row && row.status !== "trusted" && (
                  <SportyBetForm action="tournament" fields={{ league: l.code, intent: "approve" }}>
                    Use it
                  </SportyBetForm>
                )}
                {!l.ids.sportyBet && row && row.status !== "rejected" && (
                  <SportyBetForm action="tournament" variant="danger" fields={{ league: l.code, intent: "reject" }}>
                    Wrong
                  </SportyBetForm>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-1 font-mono text-base">{value}</p>
    </div>
  );
}

function LaunchCheck({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-ink-muted" : "text-amber"}`}>
      <span className="font-bold">{ok ? "✓" : "!"}</span>
      {text}
    </li>
  );
}
