import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site-url";

/**
 * Send-only Gmail integration for one admin's own dashboard, not a general
 * team feature.
 *
 * Deliberately the narrowest Gmail scope that does the job: gmail.send
 * alone, never gmail.readonly or gmail.modify. This can send mail as the
 * connected account; it can never read a single message already in that
 * inbox. Testing-mode OAuth apps don't require Google's verification review
 * regardless of scope sensitivity as long as access stays under the test-user
 * cap (100), so the narrow scope here is about least privilege, not about
 * dodging that review — with the consent screen left in Testing mode and
 * ADMIN_MAIL_ALLOWED_EMAIL added as a test user, this works for exactly the
 * one admin it's meant for and nobody else either way.
 *
 * The plain `email` scope rides alongside it for exactly one reason: knowing
 * which address got connected, to show in the UI and use as the "self" Send
 * As option. That's the basic, non-sensitive OAuth scope every Google sign-in
 * button already requests — turns out gmail.send alone isn't enough to call
 * Gmail's own users.getProfile (confirmed against a real "insufficient
 * authentication scopes" error, not assumed), and widening to a broader
 * Gmail scope just to read an email address would have undone the whole
 * point of staying send-only.
 *
 * ADMIN_MAIL_ALLOWED_EMAIL is a second, independent gate on top of the
 * ordinary admin check: every other admin feature in this app treats all
 * admins as equal (see admin_users' own migration comment), but this one
 * holds a live credential capable of sending email as a specific person, so
 * it is deliberately restricted to that one person regardless of how many
 * other admins exist.
 */

const SCOPE = "https://www.googleapis.com/auth/gmail.send email";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
/** Longest a Google OAuth or Gmail call may take. */
const GOOGLE_TIMEOUT_MS = 10_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function clientId(): string | null {
  return process.env.GOOGLE_MAIL_CLIENT_ID?.trim() || null;
}

function clientSecret(): string | null {
  return process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() || null;
}

export function mailOAuthConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

/** The one admin email allowed to use this feature, or null when unset (feature entirely off). */
export function adminMailAllowedEmail(): string | null {
  return process.env.ADMIN_MAIL_ALLOWED_EMAIL?.trim().toLowerCase() || null;
}

export function isMailAdmin(email: string): boolean {
  const allowed = adminMailAllowedEmail();
  return Boolean(allowed) && email.trim().toLowerCase() === allowed;
}

/** support@kiqstat.app — same address and same env var the support-ticket notifier already sends to. */
export function supportFromAddress(): string {
  return process.env.SUPPORT_INBOX_EMAIL?.trim() || "support@kiqstat.app";
}

function redirectUri(): string {
  return `${SITE_URL}/api/admin/mail/callback`;
}

/** Where to send the admin's browser to start the Google consent flow. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId() ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Forces Google to hand back a refresh_token even on a reconnect — without
    // this, a second connect after a revoke returns none, silently leaving
    // the old (now-invalid) token in place.
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Trades an OAuth `code` for tokens, and the connected account's own address. */
export async function exchangeCodeForConnection(
  code: string,
): Promise<{ email: string; refreshToken: string } | null> {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) return null;

  const res = await fetch(TOKEN_URL, {
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
    cache: "no-store",
  }).catch(() => null);

  const body = (await res?.json().catch(() => null)) as TokenResponse | null;
  if (!res?.ok || !body?.access_token || !body.refresh_token) {
    // The whole point of this connection flow failing is invisible otherwise:
    // the callback route always 307s regardless of outcome, so without this
    // there is no record anywhere of WHY — an unauthenticated `invalid_client`
    // (wrong client secret) looks identical in the UI to `invalid_grant` (a
    // reused/expired code) or a network failure, and guessing between them
    // from the outside wastes a round trip every time this breaks.
    console.error("[admin-mail] token exchange failed:", res?.status, body?.error, body?.error_description);
    return null;
  }

  const email = await fetchAccountEmail(body.access_token);
  if (!email) return null;

  return { email, refreshToken: body.refresh_token };
}

/**
 * The connected account's own address, off Google's plain userinfo endpoint
 * rather than Gmail's users.getProfile — the latter needs a broader Gmail
 * scope than gmail.send alone provides (confirmed by a real 403 "insufficient
 * authentication scopes" the first time this ran), and widening the Gmail
 * scope just to read an address would defeat the point of staying send-only.
 */
async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { email?: string; error?: { message?: string } } | null;
  if (!res?.ok) console.error("[admin-mail] userinfo fetch failed:", res?.status, body?.error?.message);
  return res?.ok ? (body?.email ?? null) : null;
}

/** A fresh access token for a stored refresh token — minted on every send rather than cached, since this fires rarely. */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) return null;

  const res = await fetch(TOKEN_URL, {
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  }).catch(() => null);

  const body = (await res?.json().catch(() => null)) as TokenResponse | null;
  if (!res?.ok) console.error("[admin-mail] token refresh failed:", res?.status, body?.error, body?.error_description);
  return res?.ok ? (body?.access_token ?? null) : null;
}

interface StoredConnection {
  email: string;
  refreshToken: string;
}

export async function getConnection(adminId: string): Promise<StoredConnection | null> {
  const { data } = await supabaseAdmin()
    .from("admin_mail_connections")
    .select("email, refresh_token")
    .eq("admin_id", adminId)
    .maybeSingle();
  if (!data) return null;
  return { email: data.email as string, refreshToken: data.refresh_token as string };
}

export async function saveConnection(adminId: string, email: string, refreshToken: string): Promise<void> {
  await supabaseAdmin()
    .from("admin_mail_connections")
    .upsert(
      { admin_id: adminId, email, refresh_token: refreshToken, updated_at: new Date().toISOString() },
      { onConflict: "admin_id" },
    );
}

export async function deleteConnection(adminId: string): Promise<void> {
  await supabaseAdmin().from("admin_mail_connections").delete().eq("admin_id", adminId);
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A bare ASCII header value — every field here is operator-typed, not sourced from an untrusted request, but a stray newline would still corrupt the raw message. */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export type SendMailResult = { ok: true } | { ok: false; error: string };

/**
 * Sends one plain-text email through the connected account's Gmail, as
 * `from` (the connected address itself, or a verified Send As alias like
 * support@kiqstat.app).
 *
 * Takes the caller's own already-loaded refresh token rather than an admin id
 * to look one up again — the caller (sendMail, admin/mail.ts) already has to
 * load the connection itself to know which address "self" even means, so
 * this avoids fetching it from Supabase twice per send.
 *
 * Never throws — every failure resolves to `{ ok: false, error }` with a
 * message worth showing an admin who is actively waiting on this, not a
 * generic "something went wrong": distinguishes an expired/revoked grant from
 * Gmail refusing the `from` address (the most likely cause being `from` isn't
 * actually a verified Send As alias yet).
 */
export async function sendMailAs(
  refreshToken: string,
  opts: { from: string; to: string; subject: string; body: string },
): Promise<SendMailResult> {
  const accessToken = await refreshAccessToken(refreshToken);
  if (!accessToken) {
    return { ok: false, error: "Couldn't refresh the Gmail connection — reconnect your Google account." };
  }

  const message = [
    `From: ${sanitizeHeader(opts.from)}`,
    `To: ${sanitizeHeader(opts.to)}`,
    `Subject: ${sanitizeHeader(opts.subject)}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    opts.body,
  ].join("\r\n");

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64UrlEncode(message) }),
    cache: "no-store",
  }).catch(() => null);

  if (res?.ok) return { ok: true };

  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  const reason = body?.error?.message ?? "";
  if (/unauthorized|invalid_grant/i.test(reason)) {
    return { ok: false, error: "Gmail rejected the connection — reconnect your Google account." };
  }
  if (res?.status === 403 || /invalid.*from|not.*allowed.*from/i.test(reason)) {
    return {
      ok: false,
      error: `Gmail refused to send as "${opts.from}" — it must be a verified "Send As" address in that Gmail account first (Gmail Settings → Accounts).`,
    };
  }
  return { ok: false, error: "Couldn't send — Gmail's API didn't accept the message. Try again shortly." };
}
