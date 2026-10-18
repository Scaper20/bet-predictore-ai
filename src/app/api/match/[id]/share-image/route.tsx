import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOCKUP_ASPECT, lockupSvg } from "@/lib/brand-mark";
import { matchDetail } from "@/lib/service";
import { getEntitlement } from "@/lib/entitlements";
import { viewerForTier } from "@/lib/viewer";
import { viewPrediction } from "@/lib/access";
import { fixtureStatMarkets } from "@/lib/stat-markets-service";
import { buildTopPicks, type TopPick } from "@/lib/top-picks";
import { RISK, riskFor } from "@/lib/model/risk";
import { isStrong } from "@/lib/model/tiers";
import { flagUrl } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The site's palette (Ink, Pitch, Steel, Chalk, Volt, Signal). */
const C = {
  ink: "#0b0e0d",
  pitch: "#121815",
  panel: "#161d1a",
  line: "#27322c",
  chalk: "#f2f4ec",
  steel: "#97a39c",
  dim: "#66726b",
  volt: "#d4ff3a",
  signal: "#ff5d73",
  amber: "#f5b942",
};

const RISK_TONE = { low: C.volt, medium: C.amber, high: C.signal } as const;
const LOCKUP_SRC = `data:image/svg+xml;base64,${Buffer.from(lockupSvg(C.chalk, C.volt)).toString("base64")}`;

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

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

function Crest({ data, name }: { data: string | null; name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 176, height: 176, borderRadius: 88, background: "rgba(242,244,236,0.06)", border: `2px solid ${C.line}` }}>
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
        <img src={data} width={116} height={116} style={{ objectFit: "contain" }} alt="" />
      ) : (
        <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 52, color: C.chalk }}>{initials(name)}</div>
      )}
    </div>
  );
}

/** The model's chance as a ring: the arc is the probability. */
function Ring({ p, tone }: { p: number; tone: string }) {
  const size = 148;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", top: 0, left: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * p} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 36, color: C.chalk }}>{pctText(p)}</div>
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

function Chip({ children, color, fill }: { children: React.ReactNode; color: string; fill?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 16px",
        borderRadius: 20,
        fontFamily: "Plex Mono",
        fontSize: 20,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: fill ? C.ink : color,
        background: fill ? color : "transparent",
        border: fill ? "none" : `2px solid ${color}`,
      }}
    >
      {children}
    </div>
  );
}

/** "Home or Draw" reads better on a shared image as "Udinese or Draw". */
function withTeams(label: string, home: string, away: string): string {
  return label.replace(/\bHome\b/, home).replace(/\bAway\b/, away);
}

function PickCard({ pick, strong, home, away }: { pick: TopPick; strong: boolean; home: string; away: string }) {
  const level = riskFor(pick.probability);
  const won = pick.outcome === "win";
  const lost = pick.outcome === "lose";
  const edge = won ? C.volt : lost ? C.signal : pick.headline ? "rgba(212,255,58,0.55)" : C.line;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "30px 32px", borderRadius: 32, background: won ? "rgba(212,255,58,0.07)" : C.panel, border: `2px solid ${edge}` }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Plex Mono", fontSize: 20, letterSpacing: 2.5, textTransform: "uppercase", color: C.steel }}>
          {pick.headline ? <div style={{ display: "flex", color: C.volt }}>KiqStat pick</div> : null}
          {pick.headline ? <div style={{ display: "flex", color: C.dim }}>/</div> : null}
          <div style={{ display: "flex" }}>{pick.group}</div>
        </div>
        <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 46, lineHeight: 1.1, color: lost ? C.steel : C.chalk }}>{withTeams(pick.label, home, away)}</div>
        {pick.reasons[0] ? <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 25, color: C.steel }}>{pick.reasons[0]}</div> : null}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {won ? (
            <Chip color={C.volt} fill>
              <Tick color={C.ink} /> Landed
            </Chip>
          ) : lost ? (
            <Chip color={C.signal} fill>
              <Cross color={C.ink} /> Missed
            </Chip>
          ) : null}
          {strong ? (
            <Chip color={C.amber} fill>
              Strong
            </Chip>
          ) : null}
          <Chip color={RISK_TONE[level]}>{RISK[level].label}</Chip>
        </div>
      </div>
      <Ring p={pick.probability} tone={lost ? C.signal : C.volt} />
    </div>
  );
}

/* ------------------------------------------------------------ route */

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

  const [fontList, homeCrest, awayCrest] = await Promise.all([
    loadFonts().catch(() => [] as Font[]),
    crestData(match.home.crest, match.home.name),
    crestData(match.away.crest, match.away.name),
  ]);

  const strong = isStrong(prediction.topPick, match.league.code);
  const started = match.status !== "scheduled" && match.score.home !== null && match.score.away !== null;
  const stage = match.status === "finished" ? "Full time" : match.status === "halftime" ? "Half time" : match.status === "live" ? "Live" : "Kick-off";
  const live = match.status === "live" || match.status === "halftime";
  const sub = [match.league.name, match.round].filter(Boolean).join("  ·  ");
  const split = [
    { label: match.home.name, p: prediction.markets.home },
    { label: "Draw", p: prediction.markets.draw },
    { label: match.away.name, p: prediction.markets.away },
  ];
  const top = Math.max(...split.map((s) => s.p));

  const width = 1080;
  // Measured: about 1,000px of frame plus a card per pick; the footer's auto margin takes the slack.
  const height = 1060 + picks.length * 296;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "56px 56px 48px",
          background: C.ink,
          backgroundImage: "radial-gradient(900px 620px at 50% -120px, rgba(212,255,58,0.16), rgba(11,14,13,0) 70%)",
          fontFamily: "Space Grotesk",
          color: C.chalk,
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
          <img src={LOCKUP_SRC} width={Math.round(48 * LOCKUP_ASPECT)} height={48} alt="KiqStat" />
          <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 21, letterSpacing: 3, textTransform: "uppercase", color: C.steel }}>
            {lagos(match.kickoff, { weekday: "short", day: "numeric", month: "short" })}
          </div>
        </div>

        {/* Fixture */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 52 }}>
          <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 22, letterSpacing: 3.5, textTransform: "uppercase", color: C.steel }}>{sub}</div>
          <div style={{ display: "flex", width: "100%", alignItems: "flex-start", justifyContent: "space-between", marginTop: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 300, gap: 22 }}>
              <Crest data={homeCrest} name={match.home.name} />
              <div style={{ display: "flex", textAlign: "center", justifyContent: "center", fontWeight: 700, fontSize: 34, lineHeight: 1.15 }}>{match.home.name}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 34, gap: 18 }}>
              <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: started ? 104 : 80, color: started ? C.volt : C.chalk, letterSpacing: -2 }}>
                {started ? `${match.score.home}–${match.score.away}` : lagos(match.kickoff, { hour: "2-digit", minute: "2-digit", hour12: false })}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 40,
                  padding: "0 18px",
                  borderRadius: 20,
                  fontFamily: "Plex Mono",
                  fontSize: 20,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: live ? C.ink : C.steel,
                  background: live ? C.signal : "rgba(242,244,236,0.06)",
                }}
              >
                {stage}
                {!started ? <div style={{ display: "flex", color: C.dim }}>WAT</div> : null}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 300, gap: 22 }}>
              <Crest data={awayCrest} name={match.away.name} />
              <div style={{ display: "flex", textAlign: "center", justifyContent: "center", fontWeight: 700, fontSize: 34, lineHeight: 1.15 }}>{match.away.name}</div>
            </div>
          </div>
        </div>

        {/* The model's read on the result */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 52, padding: "28px 32px", borderRadius: 28, background: C.pitch, border: `2px solid ${C.line}` }}>
          <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 19, letterSpacing: 3, textTransform: "uppercase", color: C.dim }}>Model&apos;s read</div>
          <div style={{ display: "flex", gap: 6, marginTop: 18, height: 16 }}>
            {split.map((s) => (
              <div key={s.label} style={{ display: "flex", width: `${s.p * 100}%`, height: 16, borderRadius: 8, background: s.p === top ? C.volt : "rgba(242,244,236,0.18)" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            {split.map((s, i) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: i === 0 ? "flex-start" : i === 1 ? "center" : "flex-end", width: 300 }}>
                <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 30, color: s.p === top ? C.volt : C.chalk }}>{pctText(s.p)}</div>
                <div style={{ display: "flex", fontSize: 22, color: C.steel, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Picks */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 52 }}>
          <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 30 }}>Top picks</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 22, background: C.volt, color: C.ink, fontFamily: "Unbounded", fontSize: 22 }}>{picks.length}</div>
          <div style={{ display: "flex", flex: 1, height: 2, background: C.line }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 28 }}>
          {picks.map((p) => (
            <PickCard key={p.market} pick={p} strong={p.headline && strong} home={match.home.name} away={match.away.name} />
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "30px 36px", borderRadius: 28, background: C.volt, color: C.ink }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontFamily: "Unbounded", fontSize: 30 }}>Every market, every game</div>
            <div style={{ display: "flex", fontWeight: 500, fontSize: 24 }}>Form, the reasons behind each pick and the full record</div>
          </div>
          <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 26, letterSpacing: 1 }}>kiqstat.app</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22, fontFamily: "Plex Mono", fontSize: 18, letterSpacing: 2, textTransform: "uppercase", color: C.dim }}>
          Model chances, not guarantees  ·  18+
        </div>
      </div>
    ),
    { width, height, fonts: fontList, headers: { "Cache-Control": "private, no-store" } },
  );
}
