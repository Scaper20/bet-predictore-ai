import { ImageResponse } from "next/og";
import { LOCKUP_ASPECT, lockupSvg } from "@/lib/brand-mark";
import { matchDetail } from "@/lib/service";
import { getEntitlement } from "@/lib/entitlements";
import { viewerForTier } from "@/lib/viewer";
import { viewPrediction } from "@/lib/access";
import { fixtureStatMarkets } from "@/lib/stat-markets-service";
import { buildTopPicks, type TopPick } from "@/lib/top-picks";
import { RISK, riskFor } from "@/lib/model/risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const C = {
  bg: "#0b0e0d",
  panel: "#151c19",
  line: "#24302a",
  ink: "#f2f4ec",
  muted: "#97a39c",
  dim: "#6b7670",
  brand: "#d4ff3a",
  brandInk: "#07090b",
  rose: "#ff5d73",
  amber: "#f5b942",
};

const LOCKUP_SRC = `data:image/svg+xml;base64,${Buffer.from(lockupSvg(C.brandInk)).toString("base64")}`;
const LOCKUP_H = 56;

const GROUP_TITLE: Record<string, string> = { Goals: "Total Goals", "Match Result": "Match Result" };
const RISK_TONE = { low: C.brand, medium: C.amber, high: C.rose } as const;

const lagos = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", ...opts });

/** One match's picks as a branded image to save or share. Built from the match id alone, so nothing in the URL is trusted. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) return new Response("Match not found", { status: 404 });

  // The viewer's own view, as the page builds it: a locked pick has nothing to draw,
  // and the count markets are Pro only.
  const entitlement = await getEntitlement();
  const viewer = await viewerForTier(entitlement.tier);
  const prediction = viewPrediction(detail.prediction, viewer);
  const { match } = detail;
  const extra = viewer.paid && !prediction.locked.proLeague ? await fixtureStatMarkets(match, detail.prediction).catch(() => null) : null;
  const picks = buildTopPicks({ prediction, corners: extra?.stats.corners });
  if (picks.length === 0) return new Response("No picks to share for this match yet", { status: 404 });

  // A score to show once the game has started, with where it stands.
  const started = match.status !== "scheduled" && match.score.home !== null && match.score.away !== null;
  const stage = match.status === "finished" ? "Full time" : match.status === "halftime" ? "Half time" : match.status === "live" ? "Live" : "";
  const groups = new Map<string, TopPick[]>();
  for (const p of picks) (groups.get(p.group) ?? groups.set(p.group, []).get(p.group)!).push(p);

  const width = 1080;
  const height = 790 + groups.size * 90 + picks.length * 112;
  const sub = [match.league.name, match.round].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.brand, padding: "32px 56px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
          <img src={LOCKUP_SRC} width={Math.round(LOCKUP_H * LOCKUP_ASPECT)} height={LOCKUP_H} alt="KiqStat" />
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: C.brandInk }}>Predictions</div>
        </div>

        <div style={{ display: "flex", padding: "36px 56px 0", fontSize: 26, color: C.muted }}>{sub}</div>

        <div style={{ display: "flex", alignItems: "center", margin: "20px 56px 0", padding: "40px 32px", background: C.panel, borderRadius: 24, border: `2px solid ${C.line}` }}>
          <div style={{ display: "flex", flex: 1, justifyContent: "flex-start", fontSize: 40, fontWeight: 800, color: C.ink }}>{match.home.name}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px" }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: C.brand }}>
              {started ? `${match.score.home} - ${match.score.away}` : lagos(match.kickoff, { hour: "2-digit", minute: "2-digit", hour12: false })}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: C.muted, marginTop: 6 }}>
              {stage ? `${stage} · ` : ""}
              {lagos(match.kickoff, { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", textAlign: "right", fontSize: 40, fontWeight: 800, color: C.ink }}>{match.away.name}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", margin: "36px 56px 0", padding: "22px 0", borderRadius: 40, background: C.ink, color: C.brandInk, fontSize: 28, fontWeight: 700 }}>
          Our top picks
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "8px 56px 0" }}>
          {[...groups].map(([group, list]) => (
            <div key={group} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20, height: 90, fontSize: 26, color: C.muted }}>
                {GROUP_TITLE[group] ?? group}
                <div style={{ display: "flex", flex: 1, height: 2, background: C.line }} />
              </div>
              {list.map((p) => {
                const level = riskFor(p.probability);
                const mark = p.outcome === "win" ? C.brand : p.outcome === "lose" ? C.rose : C.dim;
                const glyph = p.outcome === "win" ? "✓" : p.outcome === "lose" ? "✕" : "";
                return (
                  <div key={p.market} style={{ display: "flex", alignItems: "center", gap: 20, height: 100, padding: "0 24px", borderRadius: 20, background: p.outcome === "win" ? "#17301f" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: p.outcome ? mark : "transparent", border: p.outcome ? "none" : `3px solid ${C.dim}`, color: C.brandInk, fontSize: 28, fontWeight: 800 }}>{glyph}</div>
                    <div style={{ display: "flex", flex: 1, fontSize: 34, fontWeight: 700, color: p.outcome === "lose" ? C.muted : C.ink }}>{p.label}</div>
                    <div style={{ display: "flex", padding: "8px 18px", borderRadius: 12, background: C.panel, fontSize: 28, fontWeight: 700, color: C.ink }}>{Math.round(p.probability * 100)}%</div>
                    <div style={{ display: "flex", padding: "8px 18px", borderRadius: 12, background: C.panel, fontSize: 24, fontWeight: 700, color: RISK_TONE[level] }}>{RISK[level].label}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", margin: "auto 56px 40px", padding: "32px 36px", borderRadius: 20, background: C.brand, color: C.brandInk }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>Want the full breakdown?</div>
          <div style={{ display: "flex", fontSize: 24, marginTop: 8 }}>Every market, form and the reasons behind each pick at kiqstat.app</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 56px 32px", fontSize: 22, color: C.dim }}>
          <div style={{ display: "flex" }}>Model chances, not guarantees · 18+</div>
          <div style={{ display: "flex", color: C.brand, fontWeight: 700 }}>kiqstat.app</div>
        </div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "private, no-store" } },
  );
}
