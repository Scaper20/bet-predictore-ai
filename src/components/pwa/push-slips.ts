"use client";

import { slipSettled } from "@/lib/slip-tracker";
import type { TrackedSlip } from "@/lib/tracked-slips";
import { pushEndpoint } from "./push";

/**
 * Keeps the server's copy of this device's tracked slips in step with the
 * browser's (lib/tracked-slips.ts), so a result can be pushed with the app
 * closed. Only for a device with notifications on.
 *
 * What the server has been given is remembered per endpoint, so a pass only
 * sends what changed: slips added, slips whose settled legs grew (so a game
 * the user watched finish is not announced again), and slips removed. A slip
 * the app has already settled is removed: the person saw it land.
 */

const KEY = "kiqstat.push-slips.v1";
const API = "/api/push/slips";

interface Synced {
  endpoint: string;
  /** Slip id -> how many legs were settled when it was last sent. */
  slips: Record<string, number>;
}

function read(endpoint: string): Synced {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Synced | null;
    if (raw && raw.endpoint === endpoint && raw.slips && typeof raw.slips === "object") return raw;
  } catch {
    // Start again: re-sending a slip is harmless.
  }
  return { endpoint, slips: {} };
}

function write(s: Synced) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: the next pass re-sends.
  }
}

let running: Promise<void> | null = null;
let again = false;
let latest: TrackedSlip[] = [];

/** One pass at a time; a change that arrives mid-pass triggers one more. */
export function syncSlips(slips: TrackedSlip[]): Promise<void> {
  if (running) {
    again = true;
    latest = slips;
    return running;
  }
  latest = slips;
  running = (async () => {
    do {
      again = false;
      await pass(latest);
    } while (again);
  })()
    .catch(() => {})
    .finally(() => {
      running = null;
    });
  return running;
}

async function pass(slips: TrackedSlip[]) {
  const endpoint = await pushEndpoint();
  if (!endpoint) return;
  const synced = read(endpoint);
  const wanted = new Map(slips.filter((s) => !slipSettled(s.legs, s.results)).map((s) => [s.id, s]));

  for (const [id, slip] of wanted) {
    const settled = Object.keys(slip.results).length;
    if (synced.slips[id] === settled) continue;
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, slip: { id, legs: slip.legs, results: slip.results } }),
    }).catch(() => null);
    if (res?.ok) synced.slips[id] = settled;
  }
  for (const id of Object.keys(synced.slips)) {
    if (wanted.has(id)) continue;
    const res = await fetch(API, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, slipId: id }),
    }).catch(() => null);
    if (res?.ok) delete synced.slips[id];
  }
  write(synced);
}
