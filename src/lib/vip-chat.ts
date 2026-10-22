/**
 * The VIP WhatsApp chat: the rules, kept pure so they are tested once.
 *
 * The group is run by hand in WhatsApp with "Approve new participants" on.
 * The site's part (migration 0064) is to hand the invite link to VIP members
 * only, to record the number each one joins with so an admin can match a
 * join request to a paying account, and to say whose number has to come out
 * when a membership lapses.
 */

/**
 * A WhatsApp number as E.164 ("+2348031234567"), or null when it can't be
 * one. Nigerian numbers are accepted the way people write them at home
 * ("0803 123 4567", "803..."); anything else needs its country code.
 */
export function normaliseWhatsAppNumber(raw: string): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!/^\+?\d+$/.test(digits)) return null;

  let e164: string;
  if (digits.startsWith("+")) e164 = digits;
  else if (digits.startsWith("234")) e164 = `+${digits}`;
  // A Nigerian mobile written locally: 0 then ten digits, or the ten alone.
  else if (/^0[789][01]\d{8}$/.test(digits)) e164 = `+234${digits.slice(1)}`;
  else if (/^[789][01]\d{8}$/.test(digits)) e164 = `+234${digits}`;
  else return null;

  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/**
 * A group invite link as WhatsApp gives it, cleaned to the bare link, or
 * null. Copying a link in the app now adds a tracking query
 * ("?mode=ems_copy_t"); that is dropped.
 */
export function normaliseInviteUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "chat.whatsapp.com") return null;
  const code = url.pathname.replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(code)) return null;
  return `https://chat.whatsapp.com/${code}`;
}

/** Shown so a number can be read back at a glance: "+234 803 123 4567". */
export function formatWhatsAppNumber(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

export type RosterStatus =
  /** On a live VIP plan, and has opened the link. */
  | "in"
  /** On a live VIP plan, has given a number, not opened the link yet. */
  | "not-joined"
  /** No longer VIP, opened the link, and not yet marked as removed. */
  | "remove"
  /** No longer VIP and out of the group (or never opened the link). */
  | "out";

export function rosterStatus(m: { vip: boolean; openedAt: string | null; removedAt: string | null }): RosterStatus {
  if (m.vip) return m.openedAt ? "in" : "not-joined";
  return m.openedAt && !m.removedAt ? "remove" : "out";
}
