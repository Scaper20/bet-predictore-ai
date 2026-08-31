import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "BetriX — Football Predictions Built on Real Data";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read once at module scope — this doesn't depend on request data, and the
// image is statically generated at build time (no request-time APIs used
// below), so there's no per-request cost to re-derive.
const logoData = await readFile(join(process.cwd(), "public/brand/icon-green.png"), "base64");
const logoSrc = `data:image/png;base64,${logoData}`;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #05080d 0%, #0a0f16 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og requires a plain <img>, not next/image */}
        <img src={logoSrc} width={140} height={140} alt="" />
        <div style={{ display: "flex", marginTop: 32, fontSize: 84, fontWeight: 800, color: "#eef2f7" }}>
          Betri<span style={{ color: "#00f48e" }}>X</span>
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 32, color: "#8d9db2" }}>
          Football Predictions Built on Real Data
        </div>
      </div>
    ),
    { ...size },
  );
}
