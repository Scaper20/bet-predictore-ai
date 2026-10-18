import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOCKUP_ASPECT, lockupSvg } from "@/lib/brand-mark";
import { matchDetail } from "@/lib/service";
import { getEntitlement } from "@/lib/entitlements";
import { viewerForTier } from "@/lib/viewer";
import { viewPrediction } from "@/lib/access";
import { fixtureStatMarkets } from "@/lib/stat-markets-service";
import { buildTopPicks, type LiveState, type TopPick } from "@/lib/top-picks";
import { withStatOutcomes } from "@/lib/stat-results";
import { RISK, riskFor } from "@/lib/model/risk";
import { isStrong } from "@/lib/model/tiers";
import { flagUrl } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The site's two themes (globals.css). An image cannot follow the viewer's
 * theme by itself, so the share sheet asks for the one the viewer is using.
 */
const DARK = {
  bg: "#0b0e0d",
  glow: "rgba(212,255,58,0.16)",
  glowEnd: "rgba(11,14,13,0)",
  card: "#161d1a",
  cardAlt: "#121815",
  line: "#27322c",
  frame: "rgba(242,244,236,0.06)",
  track: "rgba(242,244,236,0.18)",
  text: "#f2f4ec",
  muted: "#97a39c",
  dim: "#66726b",
  accent: "#d4ff3a",
  accentSoft: "rgba(212,255,58,0.08)",
  accentEdge: "rgba(212,255,58,0.55)",
  onAccent: "#0b0e0d",
  signal: "#ff5d73",
  signalSoft: "rgba(255,93,115,0.08)",
  amber: "#f5b942",
  band: "#d4ff3a",
  onBand: "#0b0e0d",
};
type Pal = typeof DARK;
const LIGHT: Pal = {
  bg: "#f6f7f2",
  glow: "rgba(79,107,0,0.12)",
  glowEnd: "rgba(246,247,242,0)",
  card: "#ffffff",
  cardAlt: "#ffffff",
  line: "#e1e4da",
  frame: "#eef0e8",
  track: "#e3e6dc",
  text: "#07090b",
  muted: "#4c5650",
  dim: "#78827c",
  accent: "#4f6b00",
  accentSoft: "rgba(79,107,0,0.07)",
  accentEdge: "rgba(79,107,0,0.55)",
  onAccent: "#ffffff",
  signal: "#d6203f",
  signalSoft: "rgba(214,32,63,0.06)",
  amber: "#b56f00",
  band: "#d4ff3a",
  onBand: "#07090b",
};

const lockupSrc = (c: Pal) => `data:image/svg+xml;base64,${Buffer.from(lockupSvg(c.text, c === DARK ? c.accent : "#4f6b00")).toString("base64")}`;
const riskTone = (c: Pal) => ({ low: c.accent, medium: c.amber, high: c.signal }) as const;

/* ------------------------------------------------------------ assets */

type Font = { name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" };
let fonts: Promise<Font[]> | null = null;

/** Unbounded, Space Grotesk and IBM Plex Mono, vendored under assets/fonts (OFL). Read once per instance. */
function loadFonts(): Promise<Font[]> {
  fonts ??= Promise.all(
    (
      [
        ["Unbounded", "Unbounded-ExtraBold.ttf", 800],
        ["Space Grotesk", "SpaceGrotesk-Medium.ttf", 500],
        ["Space Grotesk", "SpaceGrotesk-Bold.ttf", 700],
        ["Plex Mono", "IBMPlexMono-Medium.ttf", 500],
      ] as const
    ).map(async ([name, file, weight]) => ({ name, data: await readFile(join(process.cwd(), "assets/fonts", file)), weight, style: "normal" as const })),
  ).catch((err) => {
    fonts = null;
    throw err;
  });
  return fonts;
}

const CREST_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/gif"]);
const CREST_MAX_BYTES = 600_000;

/**
 * A club's crest as a data URI, or null so the card draws initials instead.
 * Crest hosts 404 and stall often enough that the image must never wait long
 * on one or fail because of one. WebP is skipped: the renderer cannot draw it.
 */
async function crestData(src: string | undefined, name: string): Promise<string | null> {
  const url = src ?? flagUrl(name, 160);
  if (!url || !url.startsWith("https://")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3500), next: { revalidate: 86_400 } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!CREST_TYPES.has(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > CREST_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ pieces */

const lagos = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", ...opts });
const pctText = (p: number) => `${Math.round(p * 100)}%`;
const MONO = { fontFamily: "Plex Mono", textTransform: "uppercase" } as const;

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/** "Home or Draw" reads better on a shared image as "Udinese or Draw". */
function withTeams(label: string, home: string, away: string): string {
  return label.replace(/\bHome\b/, home).replace(/\bAway\b/, away);
}

function Crest({ c, data, name }: { c: Pal; data: string | null; name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 176, height: 176, borderRadius: 88, background: c.frame, border: `2px solid ${c.line}` }}>
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
        <img src={data} width={116} height={116} style={{ objectFit: "contain" }} alt="" />
      ) : (
        <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 52, color: c.text }}>{initials(name)}</div>
      )}
    </div>
  );
}

/** The model's chance as a ring: the arc is the probability. */
function Ring({ c, p, tone }: { c: Pal; p: number; tone: string }) {
  const size = 148;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", top: 0, left: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c.track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circ * p} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 36, color: c.text }}>{pctText(p)}</div>
    </div>
  );
}

function Tick({ color }: { color: string }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross({ color }: { color: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" />
    </svg>
  );
}

function Dot({ color }: { color: string }) {
  return <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: color }} />;
}

function Chip({ children, color, ink, fill }: { children: React.ReactNode; color: string; ink: string; fill?: boolean }) {
  return (
    <div style={{ ...MONO, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: 20, fontSize: 20, letterSpacing: 1.5, color: fill ? ink : color, background: fill ? color : "transparent", border: fill ? "none" : `2px solid ${color}` }}>
      {children}
    </div>
  );
}

/** Where a pick stands: settled (full time, or a goal line the score has already decided) or how it is going. */
type Standing = "won" | "lost" | "push" | "winning" | "losing" | "level" | "in-play" | "grading" | null;

/** A corners pick has no live state: the score cannot tell it, so it says when it will settle. */
function standingOf(p: TopPick, phase: "before" | "live" | "over"): Standing {
  if (p.outcome) return p.outcome === "win" ? "won" : p.outcome === "lose" ? "lost" : "push";
  if (p.live) return p.live as LiveState;
  return phase === "live" ? "in-play" : phase === "over" ? "grading" : null;
}

function StandingChip({ c, s }: { c: Pal; s: Standing }) {
  switch (s) {
    case "won":
      return <Chip color={c.accent} ink={c.onAccent} fill><Tick color={c.onAccent} /> Won</Chip>;
    case "lost":
      return <Chip color={c.signal} ink="#ffffff" fill><Cross color="#ffffff" /> Lost</Chip>;
    case "push":
      return <Chip color={c.muted} ink={c.bg} fill>Refunded</Chip>;
    case "winning":
      return <Chip color={c.accent} ink={c.onAccent}><Dot color={c.accent} /> Winning now</Chip>;
    case "losing":
      return <Chip color={c.signal} ink="#ffffff"><Dot color={c.signal} /> Losing now</Chip>;
    case "level":
      return <Chip color={c.muted} ink={c.bg}><Dot color={c.muted} /> Level now</Chip>;
    case "in-play":
      return <Chip color={c.muted} ink={c.bg}><Dot color={c.muted} /> In play</Chip>;
    case "grading":
      return <Chip color={c.muted} ink={c.bg}>Grading from match stats</Chip>;
    default:
      return null;
  }
}

function PickCard({ c, pick, strong, home, away, phase }: { c: Pal; pick: TopPick; strong: boolean; home: string; away: string; phase: "before" | "live" | "over" }) {
  const level = riskFor(pick.probability);
  const s = standingOf(pick, phase);
  const good = s === "won" || s === "winning";
  const bad = s === "lost" || s === "losing";
  const edge = s === "won" ? c.accent : s === "lost" ? c.signal : good ? c.accentEdge : bad ? c.signal : pick.headline ? c.accentEdge : c.line;
  const fill = s === "won" ? c.accentSoft : s === "lost" ? c.signalSoft : c.card;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "30px 32px", borderRadius: 32, background: fill, border: `${s === "won" || s === "lost" ? 3 : 2}px solid ${edge}` }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 12 }}>
        <div style={{ ...MONO, display: "flex", alignItems: "center", gap: 14, fontSize: 20, letterSpacing: 2.5, color: c.muted }}>
          {pick.headline ? <div style={{ display: "flex", color: c.accent }}>KiqStat pick</div> : null}
          {pick.headline ? <div style={{ display: "flex", color: c.dim }}>/</div> : null}
          <div style={{ display: "flex" }}>{pick.group}</div>
        </div>
        <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 46, lineHeight: 1.1, color: s === "lost" ? c.muted : c.text, textDecoration: s === "lost" ? "line-through" : "none" }}>
          {withTeams(pick.label, home, away)}
        </div>
        {pick.reasons[0] ? <div style={{ display: "flex", fontWeight: 500, fontSize: 25, color: c.muted }}>{pick.reasons[0]}</div> : null}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <StandingChip c={c} s={s} />
          {strong ? <Chip color={c.amber} ink={c.bg} fill>Strong</Chip> : null}
          <Chip color={riskTone(c)[level]} ink={c.bg}>{RISK[level].label}</Chip>
        </div>
      </div>
      <Ring c={c} p={pick.probability} tone={bad ? c.signal : c.accent} />
    </div>
  );
}

/* ------------------------------------------------------------ route */

/**
 * One match's picks as a branded image to save or share. Built from the match
 * id alone, so nothing in the URL is trusted beyond the theme switch.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = new URL(request.url).searchParams.get("theme") === "light" ? LIGHT : DARK;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) return new Response("Match not found", { status: 404 });

  // The viewer's own view, as the page builds it: a locked pick has nothing to draw,
  // and the count markets are Pro only.
  const entitlement = await getEntitlement();
  const viewer = await viewerForTier(entitlement.tier);
  const prediction = viewPrediction(detail.prediction, viewer);
  const { match } = detail;
  const extra = viewer.paid && !prediction.locked.proLeague ? await fixtureStatMarkets(match, detail.prediction).catch(() => null) : null;
  // Corners and shots grade from ESPN minutes after full time, not days later.
  const picks = await withStatOutcomes(buildTopPicks({ prediction, corners: extra?.stats.corners }), match);
  if (picks.length === 0) return new Response("No picks to share for this match yet", { status: 404 });

  const [fontList, homeCrest, awayCrest] = await Promise.all([
    loadFonts().catch(() => [] as Font[]),
    crestData(match.home.crest, match.home.name),
    crestData(match.away.crest, match.away.name),
  ]);

  const strong = isStrong(prediction.topPick, match.league.code);
  const started = match.status !== "scheduled" && match.score.home !== null && match.score.away !== null;
  const live = match.status === "live" || match.status === "halftime";
  const stage = match.status === "finished" ? "Full time" : match.status === "halftime" ? "Half time" : live ? "Live" : "Kick-off · WAT";
  const sub = [match.league.name, match.round].filter(Boolean).join("  ·  ");
  const split = [
    { label: match.home.name, p: prediction.markets.home },
    { label: "Draw", p: prediction.markets.draw },
    { label: match.away.name, p: prediction.markets.away },
  ];
  const top = Math.max(...split.map((x) => x.p));
  const settled = picks.filter((p) => p.outcome === "win" || p.outcome === "lose");
  const tally = match.status === "finished" && settled.length > 0 ? `${settled.filter((p) => p.outcome === "win").length} of ${settled.length} landed` : null;

  const width = 1080;
  // Measured: about 1,060px of frame plus a card per pick; the footer's auto margin takes the slack.
  // A pick name past about 26 characters wraps to a second line at this size, and so does a
  // team name past about 15; each adds a line's height.
  const wrapped = picks.filter((p) => withTeams(p.label, match.home.name, match.away.name).length > 26).length;
  const longName = Math.max(match.home.name.length, match.away.name.length) > 15 ? 40 : 0;
  const height = 1080 + picks.length * 296 + wrapped * 52 + longName;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 56px 48px", background: c.bg, backgroundImage: `radial-gradient(900px 620px at 50% -120px, ${c.glow}, ${c.glowEnd} 70%)`, fontFamily: "Space Grotesk", color: c.text }}>
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
          <img src={lockupSrc(c)} width={Math.round(48 * LOCKUP_ASPECT)} height={48} alt="KiqStat" />
          <div style={{ ...MONO, display: "flex", fontSize: 21, letterSpacing: 3, color: c.muted }}>{lagos(match.kickoff, { weekday: "short", day: "numeric", month: "short" })}</div>
        </div>

        {/* Fixture */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 52 }}>
          <div style={{ ...MONO, display: "flex", fontSize: 22, letterSpacing: 3.5, color: c.muted }}>{sub}</div>
          <div style={{ display: "flex", width: "100%", alignItems: "flex-start", justifyContent: "space-between", marginTop: 40 }}>
            {[{ team: match.home, crest: homeCrest }, null, { team: match.away, crest: awayCrest }].map((side, i) =>
              side ? (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 300, gap: 22 }}>
                  <Crest c={c} data={side.crest} name={side.team.name} />
                  <div style={{ display: "flex", textAlign: "center", justifyContent: "center", fontWeight: 700, fontSize: 34, lineHeight: 1.15 }}>{side.team.name}</div>
                </div>
              ) : (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 34, gap: 18 }}>
                  <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: started ? 104 : 80, color: started ? c.accent : c.text, letterSpacing: -2 }}>
                    {started ? `${match.score.home}–${match.score.away}` : lagos(match.kickoff, { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </div>
                  <div style={{ ...MONO, display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 18px", borderRadius: 20, fontSize: 20, letterSpacing: 2.5, color: live ? "#ffffff" : c.muted, background: live ? c.signal : c.frame }}>
                    {live ? <Dot color="#ffffff" /> : null}
                    {stage}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>

        {/* The model's read on the result */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 52, padding: "28px 32px", borderRadius: 28, background: c.cardAlt, border: `2px solid ${c.line}` }}>
          <div style={{ ...MONO, display: "flex", fontSize: 19, letterSpacing: 3, color: c.dim }}>Model&apos;s read</div>
          <div style={{ display: "flex", gap: 6, marginTop: 18, height: 16 }}>
            {split.map((x) => (
              <div key={x.label} style={{ display: "flex", width: `${x.p * 100}%`, height: 16, borderRadius: 8, background: x.p === top ? c.accent : c.track }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            {split.map((x, i) => (
              <div key={x.label} style={{ display: "flex", flexDirection: "column", alignItems: i === 0 ? "flex-start" : i === 1 ? "center" : "flex-end", width: 300 }}>
                <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 30, color: x.p === top ? c.accent : c.text }}>{pctText(x.p)}</div>
                <div style={{ display: "flex", fontSize: 22, color: c.muted, marginTop: 4 }}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Picks */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 52 }}>
          <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 30 }}>Top picks</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 22, background: c.accent, color: c.onAccent, fontFamily: "Unbounded", fontSize: 22 }}>{picks.length}</div>
          <div style={{ display: "flex", flex: 1, height: 2, background: c.line }} />
          {tally ? <div style={{ ...MONO, display: "flex", fontSize: 21, letterSpacing: 2, color: c.accent }}>{tally}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 28 }}>
          {picks.map((p) => (
            <PickCard key={p.market} c={c} pick={p} strong={p.headline && strong} home={match.home.name} away={match.away.name} phase={live ? "live" : match.status === "finished" ? "over" : "before"} />
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "30px 36px", borderRadius: 28, background: c.band, color: c.onBand }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 30 }}>Every market, every game</div>
            <div style={{ display: "flex", fontWeight: 500, fontSize: 24 }}>Form, the reasons behind each pick and the full record</div>
          </div>
          <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 26, letterSpacing: 1 }}>kiqstat.app</div>
        </div>
        <div style={{ ...MONO, display: "flex", justifyContent: "center", marginTop: 22, fontSize: 18, letterSpacing: 2, color: c.dim }}>Model chances, not guarantees  ·  18+</div>
      </div>
    ),
    { width, height, fonts: fontList, headers: { "Cache-Control": "private, no-store" } },
  );
}
