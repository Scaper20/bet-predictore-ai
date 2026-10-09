import { ImageResponse } from "next/og";

export const runtime = "nodejs";

interface SlipImageLeg {
  fixture: string;
  label: string;
  probability: number;
  league: string | null;
  kickoff: string | null;
  /** Settled legs carry their grade so a finished slip shows how it went. */
  result: "win" | "lose" | "void" | null;
}

const MAX_LEGS = 20;
const SHOWN_LEGS = 12;
const MAX_STRING_LEN = 80;

const C = {
  bg: "#0b111a",
  panel: "#131c29",
  line: "#223043",
  ink: "#eef2f7",
  muted: "#8d9db2",
  dim: "#5a6b81",
  brand: "#00f48e",
  brandInk: "#04281b",
  rose: "#ff5d73",
};

/**
 * A branded image of a tracked slip, for saving or sharing (My slips →
 * Share). Not a booking code and nothing to redeem: it shows the picks and
 * the model's chances.
 *
 * Public input (the request is unauthenticated), so every field is bounded
 * and shape-checked before it reaches the renderer.
 */
function parseLegs(raw: string | null): SlipImageLeg[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.slice(0, MAX_STRING_LEN) : null);
  const legs: SlipImageLeg[] = [];
  for (const item of parsed.slice(0, MAX_LEGS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const fixture = str(o.fixture);
    const label = str(o.label);
    const probability = typeof o.probability === "number" && o.probability > 0 && o.probability <= 1 ? o.probability : null;
    if (!fixture || !label || probability === null) continue;
    const kickoff = str(o.kickoff);
    legs.push({
      fixture,
      label,
      probability,
      league: str(o.league),
      kickoff: kickoff && Number.isFinite(Date.parse(kickoff)) ? kickoff : null,
      result: o.result === "win" || o.result === "lose" || o.result === "void" ? o.result : null,
    });
  }
  return legs;
}

const lagos = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", ...opts });

const pct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 2 : 1)}%`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const legs = parseLegs(searchParams.get("legs"));
  if (legs.length === 0) {
    return new Response("No slip legs provided", { status: 400 });
  }

  const combined = legs.reduce((p, l) => p * l.probability, 1);
  const fairOdds = 1 / combined;
  const shown = legs.slice(0, SHOWN_LEGS);
  const more = legs.length - shown.length;
  const now = new Date().toISOString();

  const width = 1080;
  const rowHeight = 132;
  const height = 560 + shown.length * rowHeight + (more > 0 ? 60 : 0);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "sans-serif" }}>
        {/* Brand band */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.brand, padding: "34px 56px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 16, background: C.brandInk, color: C.brand, fontSize: 30, fontWeight: 800 }}>
              BX
            </div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 800, color: C.brandInk }}>BetriX</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", color: C.brandInk }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700 }}>Betslip</div>
            <div style={{ display: "flex", fontSize: 22 }}>{lagos(now, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</div>
          </div>
        </div>

        {/* Headline numbers */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "44px 56px 36px", borderBottom: `2px solid ${C.line}` }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, letterSpacing: 3, color: C.muted, textTransform: "uppercase" }}>Chance all land</div>
            <div style={{ display: "flex", fontSize: 112, fontWeight: 800, color: C.brand, lineHeight: 1 }}>{pct(combined)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: C.ink }}>
              {legs.length} {legs.length === 1 ? "selection" : "selections"}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: C.muted }}>Fair odds {fairOdds.toFixed(2)}</div>
          </div>
        </div>

        {/* Legs */}
        <div style={{ display: "flex", flexDirection: "column", padding: "16px 56px 0" }}>
          {shown.map((leg, i) => {
            const mark = leg.result === "win" ? C.brand : leg.result === "lose" ? C.rose : C.dim;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, height: rowHeight, borderBottom: i < shown.length - 1 ? `1px solid ${C.line}` : "none" }}>
                <div style={{ display: "flex", width: 16, height: 16, borderRadius: 8, background: mark }} />
                <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", fontSize: 21, color: C.dim }}>
                    {[leg.league, leg.kickoff ? lagos(leg.kickoff, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : null].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: C.ink, marginTop: 4 }}>{leg.fixture}</div>
                  <div style={{ display: "flex", fontSize: 26, color: leg.result === "lose" ? C.dim : C.brand, marginTop: 4, textDecoration: leg.result === "lose" ? "line-through" : "none" }}>
                    {leg.label}
                  </div>
                </div>
                <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: C.ink }}>{Math.round(leg.probability * 100)}%</div>
              </div>
            );
          })}
          {more > 0 && (
            <div style={{ display: "flex", height: 60, alignItems: "center", fontSize: 24, color: C.muted }}>+{more} more</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "center", padding: "28px 56px", background: C.panel, borderTop: `2px solid ${C.line}` }}>
          <div style={{ display: "flex", fontSize: 22, color: C.muted }}>Model chances, not guarantees · 18+</div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: C.brand }}>betrix.com.ng</div>
        </div>
      </div>
    ),
    { width, height },
  );
}
