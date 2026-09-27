import { ImageResponse } from "next/og";

export const runtime = "nodejs";

interface SlipImageLeg {
  fixture: string;
  label: string;
  probability: number;
  fairOdds: number;
}

const MAX_LEGS = 8;
const MAX_STRING_LEN = 80;

/**
 * Renders a branded, shareable slip image from legs passed as a query
 * param — this is public input (the request is unauthenticated, matching
 * every other read here), so it's bounded and shape-checked before
 * anything reaches the renderer. Reuses `ImageResponse`, already a proven
 * dependency in this repo via src/app/opengraph-image.tsx — no new package.
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

  const legs: SlipImageLeg[] = [];
  for (const item of parsed.slice(0, MAX_LEGS)) {
    if (!item || typeof item !== "object") continue;
    const { fixture, label, probability, fairOdds } = item as Record<string, unknown>;
    if (typeof fixture !== "string" || typeof label !== "string") continue;
    if (typeof probability !== "number" || typeof fairOdds !== "number") continue;
    legs.push({
      fixture: fixture.slice(0, MAX_STRING_LEN),
      label: label.slice(0, MAX_STRING_LEN),
      probability,
      fairOdds,
    });
  }
  return legs;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const legs = parseLegs(searchParams.get("legs"));
  if (legs.length === 0) {
    return new Response("No slip legs provided", { status: 400 });
  }

  const width = 1080;
  const rowHeight = 108;
  const height = 320 + legs.length * rowHeight;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #05080d 0%, #0a0f16 100%)",
          fontFamily: "sans-serif",
          padding: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#eef2f7" }}>
            My Betri<span style={{ color: "#00f48e" }}>X</span> Slip
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#8d9db2", marginTop: 8 }}>
          {legs.length} {legs.length === 1 ? "selection" : "selections"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, gap: 16 }}>
          {legs.map((leg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: "20px 28px",
              }}
            >
              <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#eef2f7" }}>{leg.fixture}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                <div style={{ display: "flex", fontSize: 22, color: "#00f48e", fontWeight: 600 }}>{leg.label}</div>
                <div style={{ display: "flex", fontSize: 22, color: "#8d9db2" }}>
                  {Math.round(leg.probability * 100)}% · needs {leg.fairOdds.toFixed(2)}+
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: "auto", paddingTop: 32, fontSize: 18, color: "#5b6b80" }}>
          Personal reference only, not redeemable · betrix.com.ng
        </div>
      </div>
    ),
    { width, height },
  );
}
