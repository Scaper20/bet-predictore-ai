import type { Offer, OfferAudience } from "@/lib/offers";

/**
 * Reads the offer editor's form (/admin/offers) into the fields an offer row
 * holds, or the first thing wrong with it. Pure, so the rules are tested;
 * the database checks the same bounds again (0087).
 */

export type OfferInput = Omit<Offer, "id" | "active">;

const AUDIENCES: OfferAudience[] = ["new_visitors", "free_members", "email"];

function int(v: FormDataEntryValue | null): number | null {
  const s = typeof v === "string" ? v.replace(/[,\s₦]/g, "") : "";
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : NaN;
}

function text(v: FormDataEntryValue | null, max: number): string {
  return (typeof v === "string" ? v : "").trim().slice(0, max);
}

/** A datetime-local value, read as Lagos time (UTC+1, no DST). */
function lagos(v: FormDataEntryValue | null): string | null | "bad" {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return "bad";
  const ms = Date.parse(`${s}:00+01:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "bad";
}

export function parseOfferForm(f: FormData): { ok: true; offer: OfferInput } | { ok: false; error: string } {
  const slug = text(f.get("slug"), 40).toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return { ok: false, error: "The link name takes 2 to 40 lowercase letters, digits and dashes." };
  const name = text(f.get("name"), 80);
  if (!name) return { ok: false, error: "Give the offer a name." };
  const audience = text(f.get("audience"), 20) as OfferAudience;
  if (!AUDIENCES.includes(audience)) return { ok: false, error: "Pick who the offer is for." };
  const tier = f.get("tier") === "pro" ? "pro" : "vip";

  const hours = int(f.get("hours"));
  if (hours === null || Number.isNaN(hours) || hours < 1 || hours > 2160) return { ok: false, error: "The pass lasts 1 to 2,160 hours (90 days)." };
  const price = int(f.get("price"));
  if (price === null || Number.isNaN(price) || price < 50) return { ok: false, error: "The price is at least ₦50." };
  if (price > 10_000_000) return { ok: false, error: "That price is too high." };
  const compare = int(f.get("compare"));
  if (Number.isNaN(compare) || (compare !== null && compare <= 0)) return { ok: false, error: "The crossed-out price is a whole number of naira, or empty." };
  const window = int(f.get("window"));
  if (Number.isNaN(window) || (window !== null && (window < 1 || window > 2160))) return { ok: false, error: "The window is 1 to 2,160 hours, or empty." };
  if (audience === "new_visitors" && window === null) return { ok: false, error: "A new-visitor offer needs a window: how long after the first visit it stays open." };
  const max = int(f.get("max")) ?? 1;
  if (Number.isNaN(max) || max < 1 || max > 100) return { ok: false, error: "Buys per account is 1 to 100." };

  const startsAt = lagos(f.get("starts"));
  const endsAt = lagos(f.get("ends"));
  if (startsAt === "bad" || endsAt === "bad") return { ok: false, error: "Dates need a day and a time." };
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, error: "The end comes after the start." };

  const headline = text(f.get("headline"), 80);
  if (!headline) return { ok: false, error: "Write a headline." };
  const perks = text(f.get("perks"), 600)
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 6);

  return {
    ok: true,
    offer: {
      slug,
      name,
      audience,
      tier,
      hours,
      priceNaira: price,
      compareNaira: compare,
      windowHours: window,
      startsAt,
      endsAt,
      maxPerAccount: max,
      headline,
      subline: text(f.get("subline"), 140) || null,
      cta: text(f.get("cta"), 30) || "Get it",
      perks,
    },
  };
}

/** A stored ISO time as the editor's datetime-local value, in Lagos time. */
export function toLagosInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 16);
}
