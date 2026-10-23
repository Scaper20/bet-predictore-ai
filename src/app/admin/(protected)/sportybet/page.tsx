import type { Metadata } from "next";
import { Badge } from "@/components/ui/primitives";
import { SportyBetForm } from "@/components/admin/sportybet-forms";
import { SwitchForm } from "@/components/admin/switch-form";
import { LEAGUES, leagueByCode } from "@/lib/leagues";
import { directHealth, fetchTournamentList } from "@/lib/odds/sportybet-direct";
import type { Candidate } from "@/lib/odds/sportybet-match";
import { nameSimilarity } from "@/lib/odds/sportybet-match";
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

/** Likely SportyBet tournaments for competitions that have no id yet. Suggestions only. */
async function suggestions() {
  const missing = LEAGUES.filter((l) => !l.ids.sportyBet);
  if (missing.length === 0) return [];
  const list = await fetchTournamentList();
  if (!list) return null;
  return missing.map((league) => ({
    league,
    options: list
      .map((t) => ({
        ...t,
        score:
          nameSimilarity(league.name, t.name) +
          (league.country && nameSimilarity(league.country, t.category) > 0.6 ? 0.5 : 0),
      }))
      .filter((t) => t.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
  }));
}

export default async function AdminSportyBetPage() {
  const [sw, data, suggested] = await Promise.all([switchesFresh(), load(), suggestions()]);
  const hardOff = process.env.SPORTYBET_DIRECT?.trim() === "off";
  const health = directHealth();
  const linked = LEAGUES.filter((l) => l.ids.sportyBet);

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
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Competitions without a SportyBet id</h2>
        <p className="border-b border-line px-5 py-2 text-xs text-ink-dim">
          Suggestions read off SportyBet&rsquo;s tournament list. Check one on the live board, then add it to{" "}
          <code>ids.sportyBet</code> in <code>src/lib/leagues.ts</code>. Ids are never filled in automatically.
        </p>
        {suggested === null ? (
          <p className="px-5 py-4 text-sm text-ink-muted">SportyBet didn&rsquo;t answer just now.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {suggested.map(({ league, options }) => (
              <li key={league.code} className="px-5 py-2.5">
                <span className="font-semibold">{league.name}</span>
                <span className="text-xs text-ink-dim"> · {league.country ?? "international"}</span>
                <p className="mt-1 font-mono text-xs text-ink-muted">
                  {options.length === 0
                    ? "no likely match"
                    : options.map((o) => `${o.id} ${o.category} / ${o.name} (${o.eventSize})`).join("  ·  ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
