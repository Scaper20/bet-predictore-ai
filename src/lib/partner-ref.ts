/**
 * The referral cookie, shared by src/proxy.ts (which sets it) and the signup
 * paths (which read it). Kept free of server-only imports so the proxy can
 * use it. Its own cookie, not part of first-touch: a partner's click must win
 * for 90 days whatever the browser's first visit was.
 */
export const PARTNER_REF_COOKIE = "kq_ref";
export const PARTNER_REF_DAYS = 90;

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export interface PartnerRef {
  slug: string;
  /** When the link was clicked, ms since epoch. */
  clickedAt: number;
}

export const encodePartnerRef = (slug: string, clickedAt: number): string => `${slug}.${clickedAt}`;

/** The slug in a ?ref= value, or null when it cannot be one. */
export function cleanRefParam(raw: string | null | undefined): string | null {
  const slug = (raw ?? "").trim().toLowerCase();
  return SLUG.test(slug) && !slug.includes("--") ? slug : null;
}

/** A cookie value back into a click, or null when malformed or older than the 90-day window. */
export function parsePartnerRef(raw: string | null | undefined, now = Date.now()): PartnerRef | null {
  if (!raw) return null;
  const at = raw.lastIndexOf(".");
  if (at < 1) return null;
  const slug = cleanRefParam(raw.slice(0, at));
  const clickedAt = Number(raw.slice(at + 1));
  if (!slug || !Number.isFinite(clickedAt) || clickedAt > now + 60_000) return null;
  if (now - clickedAt > PARTNER_REF_DAYS * 86_400_000) return null;
  return { slug, clickedAt };
}
