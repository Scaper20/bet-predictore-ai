/**
 * Where the floating slip button may sit, and where it settles after a drag.
 *
 * The button can be dragged anywhere; let go and it snaps to the nearest
 * edge of the area between the header and the bottom bar (left, right, top
 * or bottom), so it never covers either and never floats mid-page.
 */

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pure: keep a point inside the bounds. */
export function clampPoint(p: Point, b: Bounds): Point {
  return { x: clamp(p.x, b.minX, b.maxX), y: clamp(p.y, b.minY, b.maxY) };
}

/** Pure: the point moved onto whichever edge of the bounds it is closest to. */
export function snapToEdge(p: Point, b: Bounds): Point {
  const c = clampPoint(p, b);
  const d = { left: c.x - b.minX, right: b.maxX - c.x, top: c.y - b.minY, bottom: b.maxY - c.y };
  const nearest = (Object.keys(d) as (keyof typeof d)[]).reduce((a, k) => (d[k] < d[a] ? k : a), "right");
  if (nearest === "left") return { x: b.minX, y: c.y };
  if (nearest === "right") return { x: b.maxX, y: c.y };
  if (nearest === "top") return { x: c.x, y: b.minY };
  return { x: c.x, y: b.maxY };
}
