"use client";

import { useEffect, useRef } from "react";

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  size: number;
  color: string;
  round: boolean;
}

const FALLBACK_COLORS = ["#00f48e", "#e8b54b", "#22afa7", "#ffb020", "#a78bfa"];
const CSS_VARS = ["--color-brand", "--color-gold", "--color-cyan", "--color-amber", "--color-violet"];
const PIECE_COUNT = 140;
const DURATION_MS = 3200;
const FADE_MS = 600;

function themeColors(): string[] {
  try {
    const style = getComputedStyle(document.documentElement);
    const colors = CSS_VARS.map((v) => style.getPropertyValue(v).trim()).filter(Boolean);
    return colors.length > 0 ? colors : FALLBACK_COLORS;
  } catch {
    return FALLBACK_COLORS;
  }
}

/**
 * One-shot confetti burst behind the gift popup card — plain canvas, no
 * animation library, colored from the app's own theme tokens so it matches
 * light/dark automatically. Purely decorative: aria-hidden, pointer-events
 * none, and skipped entirely for prefers-reduced-motion (same posture as
 * scroll-to-top.tsx).
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = themeColors();
    const pieces: Piece[] = Array.from({ length: PIECE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 2.4,
      vy: 2 + Math.random() * 2.6,
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() > 0.5,
    }));

    const start = performance.now();
    let raf = 0;

    function frame(now: number) {
      const elapsed = now - start;
      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (elapsed > DURATION_MS) return;

      const fadeStart = DURATION_MS - FADE_MS;
      const alpha = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / FADE_MS) : 1;

      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // gentle gravity
        p.rotation += p.vr;

        ctx!.save();
        ctx!.globalAlpha = alpha;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.fillStyle = p.color;
        if (p.round) {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx!.restore();
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0" />;
}
