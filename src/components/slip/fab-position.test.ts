import { describe, expect, it } from "vitest";
import { clampPoint, snapToEdge } from "./fab-position";

// A 400 x 800 phone: header 64px, bottom bar 56px, 56px button, 12px margins.
const B = { minX: 12, maxX: 332, minY: 76, maxY: 676 };

describe("floating slip button position", () => {
  it("snaps to the nearest side", () => {
    expect(snapToEdge({ x: 40, y: 400 }, B)).toEqual({ x: 12, y: 400 });
    expect(snapToEdge({ x: 300, y: 400 }, B)).toEqual({ x: 332, y: 400 });
  });

  it("snaps to the top or bottom edge, clear of the header and bottom bar", () => {
    expect(snapToEdge({ x: 170, y: 90 }, B)).toEqual({ x: 170, y: 76 });
    expect(snapToEdge({ x: 170, y: 660 }, B)).toEqual({ x: 170, y: 676 });
  });

  it("never lands over the header or the bottom bar, even dragged onto them", () => {
    expect(snapToEdge({ x: 170, y: 10 }, B).y).toBe(76);
    expect(snapToEdge({ x: 170, y: 790 }, B).y).toBe(676);
    expect(clampPoint({ x: -50, y: 2000 }, B)).toEqual({ x: 12, y: 676 });
  });
});
