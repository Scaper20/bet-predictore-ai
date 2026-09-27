/**
 * `next` reaches the auth actions from a query parameter, so it is attacker-
 * controlled: `/account/login?next=https://evil.example` would have had the
 * sign-in action redirect a freshly authenticated user straight off-site,
 * which is a credible phishing hop because the hand-off happens after the
 * password has already been accepted.
 *
 * A destination inside this app is always a bare path, so anything that could
 * resolve to a different origin is rejected outright rather than sanitised —
 * no legitimate caller needs one, and rewriting hostile input is how these
 * bugs come back.
 */

/**
 * Control characters, and the backslash. Some parsers normalise "\" to "/",
 * which would turn "/\evil.example" into a protocol-relative URL *after* the
 * prefix checks below have already passed it.
 */
const UNSAFE = /[\x00-\x1f\x7f\\]/;

export function safeNext(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;

  const next = value.trim();

  if (!next.startsWith("/")) return fallback;

  // "//evil.example" is protocol-relative: the browser keeps the scheme and
  // leaves the origin entirely.
  if (next.startsWith("//")) return fallback;

  if (UNSAFE.test(next)) return fallback;

  return next;
}
