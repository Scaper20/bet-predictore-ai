// BetriX live scores: TheSportsDB -> public.matches, once a minute while games are on.
//
// Called by pg_cron through public.invoke_live_scores() (migration 0030),
// which only fires when a game is in play or due to kick off, so a quiet
// evening costs no invocations at all.
//
// Only games already in public.matches are updated (matched on TheSportsDB's
// event id, which the fixtures job stores). Creating fixtures and resolving
// club names stays with the Python jobs, so there is one place that decides
// what a club is called.
//
// Secrets (supabase secrets set ...): THESPORTSDB_API_KEY, INGEST_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import { createClient } from "npm:@supabase/supabase-js@2";

type LiveEvent = {
  idEvent: string;
  strStatus?: string | null;
  strProgress?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
};

const STATUS: Record<string, string> = {
  FT: "finished", AET: "finished", PEN: "finished", "MATCH FINISHED": "finished",
  HT: "halftime", "HALF TIME": "halftime",
  "1H": "live", "2H": "live", ET: "live", P: "live", BT: "live", LIVE: "live",
  PST: "postponed", POSTPONED: "postponed",
  CANC: "cancelled", ABD: "cancelled", ABANDONED: "cancelled",
};

function statusOf(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toUpperCase();
  if (STATUS[s]) return STATUS[s];
  if (/^\d+\+?$/.test(s)) return "live";
  return null; // "NS" and unknowns: leave the row as it is
}

const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

Deno.serve(async (req) => {
  const secret = Deno.env.get("INGEST_SECRET");
  if (!secret || req.headers.get("x-ingest-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  const key = Deno.env.get("THESPORTSDB_API_KEY");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const started = new Date().toISOString();

  const record = async (status: string, rowsIn: number, rowsWritten: number, error: string | null, meta: object) => {
    await db.from("ingest_runs").insert({
      job: "live-scores", source: "thesportsdb", status, started_at: started,
      finished_at: new Date().toISOString(), rows_in: rowsIn, rows_written: rowsWritten, error, meta,
    });
  };

  const { data: src } = await db.from("ingest_sources").select("enabled").eq("id", "thesportsdb").maybeSingle();
  if (src && src.enabled === false) {
    await record("skipped", 0, 0, "source disabled in ingest_sources", {});
    return Response.json({ skipped: true });
  }
  if (!key || key === "123") {
    await record("failed", 0, 0, "THESPORTSDB_API_KEY (paid) not set", {});
    return new Response("no key", { status: 500 });
  }

  try {
    // v2 is where live scores live on a paid key; v1 stays as the fallback.
    let events: LiveEvent[] | null = null;
    const v2 = await fetch("https://www.thesportsdb.com/api/v2/json/livescore/soccer", { headers: { "X-API-KEY": key } });
    if (v2.ok) events = (await v2.json()).livescore ?? [];
    if (events === null) {
      const v1 = await fetch(`https://www.thesportsdb.com/api/v1/json/${key}/livescore.php?s=Soccer`);
      if (!v1.ok) throw new Error(`TheSportsDB livescore HTTP ${v1.status}`);
      events = (await v1.json()).livescore ?? [];
    }

    await db.rpc("store_raw_payload", {
      p_source: "thesportsdb", p_endpoint: "livescore", p_params: { sport: "soccer" }, p_payload: events, p_retain_days: 7,
    });

    const ids = events.map((e) => String(e.idEvent));
    const { data: known } = ids.length
      ? await db.from("matches").select("id, source_ids, status").in("source_ids->>thesportsdb", ids)
      : { data: [] as { id: string; source_ids: Record<string, string>; status: string }[] };
    const byEvent = new Map((known ?? []).map((m) => [m.source_ids.thesportsdb, m]));

    let written = 0;
    for (const e of events) {
      const match = byEvent.get(String(e.idEvent));
      const status = statusOf(e.strStatus ?? e.strProgress);
      if (!match || !status) continue;
      const live = status === "live";
      const { error } = await db.from("matches").update({
        status,
        minute: live ? num(e.strProgress) : null,
        home_goals: num(e.intHomeScore),
        away_goals: num(e.intAwayScore),
        score_source: "thesportsdb",
        updated_at: new Date().toISOString(),
      }).eq("id", match.id);
      if (!error) written++;
    }

    // Games still marked in play that dropped off the feed: ask for their final state.
    const { data: stale } = await db.from("matches")
      .select("id, source_ids")
      .in("status", ["live", "halftime"])
      .lt("kickoff", new Date(Date.now() - 100 * 60_000).toISOString())
      .limit(10);
    let settled = 0;
    for (const m of stale ?? []) {
      const id = m.source_ids?.thesportsdb;
      if (!id || ids.includes(id)) continue;
      const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${key}/lookupevent.php?id=${id}`);
      if (!res.ok) continue;
      const ev = (await res.json()).events?.[0];
      const status = statusOf(ev?.strStatus);
      if (status && status !== "live" && status !== "halftime") {
        await db.from("matches").update({
          status, minute: null, home_goals: num(ev.intHomeScore), away_goals: num(ev.intAwayScore),
          score_source: "thesportsdb", updated_at: new Date().toISOString(),
        }).eq("id", m.id);
        settled++;
      }
    }

    await record("ok", events.length, written + settled, null, { unknown_events: events.length - byEvent.size, settled });
    return Response.json({ events: events.length, updated: written, settled });
  } catch (err) {
    await record("failed", 0, 0, String(err).slice(0, 2000), {});
    return new Response("upstream failed", { status: 502 });
  }
});
