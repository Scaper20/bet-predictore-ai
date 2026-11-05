/**
 * Which signups count as people (CTO checklist 4.1). The traffic page used to
 * count every account row, so our own test accounts, mistyped addresses and
 * throwaway mailboxes lifted the totals and the source breakdowns.
 *
 *   internal   our own domain: staff and test accounts
 *   suspect    an address that cannot receive mail (a mistyped common domain)
 *              or a known throwaway mailbox provider
 *   real       everything else
 *
 * "Engaged" is a separate flag for a real account: it came back after the
 * session it signed up in. It is how a signup that was a person is told from one
 * that visited once.
 *
 * A bot that signs up with a real Gmail address looks like a person here; the
 * only signal for it is behaviour (never returns, nothing viewed), which is
 * what `engaged` carries.
 */

export type SignupQuality = "internal" | "suspect" | "real";

const INTERNAL_DOMAINS = new Set(["kiqstat.app", "kiqstat.com.ng", "betrix.com.ng"]);

/** Common mailbox providers mistyped; none of these exist as mail domains. */
const TYPO_DOMAINS = new Set([
  "gmal.com", "gmial.com", "gmail.con", "gmail.co", "gmai.com", "gamil.com", "gnail.com", "gmail.cm", "gmail.om",
  "yaho.com", "yahooo.com", "yahoo.con", "hotmal.com", "hotmail.con", "outlok.com", "outlook.con",
]);

/** Throwaway mailbox providers (a short list of the common ones; extend as they appear). */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com",
]);

export function emailDomain(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
}

export function classifySignup(email: string | null | undefined): SignupQuality {
  const domain = emailDomain(email);
  if (!domain) return "suspect";
  if (INTERNAL_DOMAINS.has(domain)) return "internal";
  if (TYPO_DOMAINS.has(domain) || DISPOSABLE_DOMAINS.has(domain)) return "suspect";
  return "real";
}

/** Came back after the visit it signed up in: seen again more than ten minutes after creation. */
export function isEngaged(createdAt: string, lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.parse(lastSeenAt) - Date.parse(createdAt) > 10 * 60_000;
}
