import { ImageResponse } from "next/og";
import { LOCKUP_ASPECT, lockupSvg } from "@/lib/brand-mark";
import { supabasePublic } from "@/lib/supabase/public";

export const runtime = "nodejs";
// Rebuilt at most hourly: it goes into emails, where every open fetches it.
export const revalidate = 3600;

/**
 * The model's most recent winning picks as one image, for emails (the
 * unfinished-checkout reminder). Only wins, by design: it is a showcase, and
 * says so in its own title. The full record, losses included, is one tap
 * away on the track record, which the email links to.
 *
 * Read from the public predictions_log with the anon key, like the track
 * record page.
 */

const SHOWN = 8;

const C = {
  bg: "#0b0e0d",
  panel: "#151c19",
  line: "#24302a",
  ink: "#f2f4ec",
  muted: "#97a39c",
  dim: "#6b7670",
  brand: "#d4ff3a",
  brandInk: "#07090b",
};

const LOCKUP_SRC = `data:image/svg+xml;base64,${Buffer.from(lockupSvg(C.brandInk)).toString("base64")}`;
const LOCKUP_H = 48;

interface Win {
  home_name: string;
  away_name: string;
  label: string;
  probability: number;
  actual_home_goals: number | null;
  actual_away_goals: number | null;
  league: string | null;
  kickoff: string;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });

export async function GET() {
  const db = supabasePublic();
  const { data } = db
    ? await db
        .from("predictions_log")
        .select("home_name, away_name, label, probability, actual_home_goals, actual_away_goals, league, kickoff")
        .eq("result", "win")
        .not("home_name", "is", null)
        .order("kickoff", { ascending: false })
        .limit(SHOWN)
    : { data: null };
  const wins = (data ?? []) as Win[];

  const width = 1080;
  const rowHeight = 112;
  const height = 250 + Math.max(1, wins.length) * rowHeight;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.brand, padding: "28px 52px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
          <img src={LOCKUP_SRC} width={Math.round(LOCKUP_H * LOCKUP_ASPECT)} height={LOCKUP_H} alt="KiqStat" />
          <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: C.brandInk }}>Recent winning picks</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "8px 52px 0" }}>
          {wins.length === 0 ? (
            <div style={{ display: "flex", height: rowHeight, alignItems: "center", fontSize: 28, color: C.muted }}>
              See every graded pick on kiqstat.app
            </div>
          ) : (
            wins.map((w, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 22, height: rowHeight, borderBottom: i < wins.length - 1 ? `1px solid ${C.line}` : "none" }}
              >
                <div style={{ display: "flex", width: 40, height: 40, borderRadius: 20, background: C.brand, alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={C.brandInk} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", fontSize: 20, color: C.dim }}>{[w.league, day(w.kickoff)].filter(Boolean).join(" · ")}</div>
                  <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: C.ink, marginTop: 2 }}>
                    {w.home_name} {w.actual_home_goals ?? ""}–{w.actual_away_goals ?? ""} {w.away_name}
                  </div>
                  <div style={{ display: "flex", fontSize: 24, color: C.brand, marginTop: 2 }}>{w.label}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: C.ink }}>{Math.round(Number(w.probability) * 100)}%</div>
                  <div style={{ display: "flex", fontSize: 18, color: C.dim }}>model chance</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "center", padding: "24px 52px", background: C.panel, borderTop: `2px solid ${C.line}` }}>
          <div style={{ display: "flex", fontSize: 20, color: C.muted }}>Winning picks only. Every pick, won or lost, is on the track record · 18+</div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: C.brand }}>kiqstat.app</div>
        </div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
