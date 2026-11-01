import "server-only";

import { Resend } from "resend";
import { SITE_URL } from "@/lib/site-url";

const FROM = process.env.EMAIL_FROM ?? "KiqStat <hello@kiqstat.app>";
const SENDBYTE_URL = "https://api.sendbyte.africa/v1/emails";
/** Sendbyte answers in under 100 ms; a send that hangs this long goes to Resend instead. */
const SENDBYTE_TIMEOUT_MS = 8_000;

export type EmailProvider = "sendbyte" | "resend";
export type SendResult =
  | { ok: true; provider: EmailProvider; id?: string }
  | { ok: false; reason: string };

type Message = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  /** Campaign emails: named in a List-Unsubscribe header, which inbox providers expect of bulk mail. */
  unsubscribeUrl?: string;
  /**
   * The same key never sends twice on Sendbyte, so a retried receipt can't land twice. Derive it
   * from the business event (payment reference + email kind), never from the time.
   */
  idempotencyKey?: string;
};

/** Sendbyte errors where another provider would do no better, or would do harm. */
const FINAL_SENDBYTE_CODES = new Set([
  // The address bounced or complained before: sending it through Resend would hurt both senders.
  "suppressed_recipient",
]);

class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function sendbyteKey(): string | undefined {
  return process.env.SENDBYTE_API_KEY?.trim() || undefined;
}
function resendKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

/** True when at least one provider is configured, so alerts and receipts can go out. */
export function canSendEmail(): boolean {
  return Boolean(sendbyteKey() || resendKey());
}

/** The configured providers, in the order a send tries them. */
export function emailProviders(): EmailProvider[] {
  const order: EmailProvider[] = [];
  if (sendbyteKey()) order.push("sendbyte");
  if (resendKey()) order.push("resend");
  return order;
}

async function viaSendbyte(key: string, m: Message): Promise<string | undefined> {
  const res = await fetch(SENDBYTE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: m.from ?? process.env.SENDBYTE_FROM ?? FROM,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: htmlToText(m.html),
      ...(m.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${m.unsubscribeUrl}>` } } : {}),
      ...(m.idempotencyKey ? { idempotency_key: m.idempotencyKey.slice(0, 256) } : {}),
      // Receipts and password links are not tracked: rewritten links look like phishing to some filters.
      tracking: { opens: false, clicks: false },
    }),
    signal: AbortSignal.timeout(SENDBYTE_TIMEOUT_MS),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as
    | { id?: string; error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    const code = body?.error?.code ?? `http_${res.status}`;
    throw new ProviderError(`${code}: ${body?.error?.message ?? res.statusText} (x-request-id ${res.headers.get("x-request-id") ?? "-"})`, code);
  }
  return body?.id;
}

async function viaResend(key: string, m: Message): Promise<string | undefined> {
  const { data, error } = await new Resend(key).emails.send({
    from: m.from ?? FROM,
    to: m.to,
    subject: m.subject,
    html: m.html,
    // A plain-text part beside the HTML: HTML-only mail scores worse with spam and tab filters.
    text: htmlToText(m.html),
    ...(m.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${m.unsubscribeUrl}>` } } : {}),
  });
  if (error) throw new ProviderError(`${error.name}: ${error.message}`, error.name);
  return data?.id;
}

/**
 * Sends through Sendbyte first and Resend when Sendbyte isn't configured or fails (timeout, outage,
 * quota, an unverified domain, a revoked key). A suppressed recipient stops there.
 *
 * Fire-and-forget by design: most call sites do `void sendEmail(...)` and never wrap it. Email is
 * additive: a payment, a signup or an admin's ticket reply must all succeed even with no provider
 * set or both down, so this never rejects. Read the result only where the email is the whole point
 * (password reset).
 */
export async function sendEmail(m: Message): Promise<SendResult> {
  const providers = emailProviders();
  if (providers.length === 0) {
    console.error("sendEmail skipped: neither SENDBYTE_API_KEY nor RESEND_API_KEY is set:", m.subject);
    return { ok: false, reason: "no-provider" };
  }
  let last = "unknown";
  for (const provider of providers) {
    try {
      const id = provider === "sendbyte" ? await viaSendbyte(sendbyteKey()!, m) : await viaResend(resendKey()!, m);
      if (provider !== providers[0]) console.warn(`sendEmail: delivered by ${provider} after ${providers[0]} failed:`, m.subject);
      return { ok: true, provider, id };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      console.error(`sendEmail via ${provider} failed:`, last);
      if (err instanceof ProviderError && provider === "sendbyte" && FINAL_SENDBYTE_CODES.has(err.code)) {
        return { ok: false, reason: err.code };
      }
    }
  }
  return { ok: false, reason: last };
}

/** The readable text of an email's HTML, links kept as "label (url)". */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<(br|\/p|\/li|\/tr|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Shared table-based layout — light background, brand-green accent wordmark.
 * Plain divs/flexbox (fine for next/og's opengraph-image.tsx, which renders
 * through Satori, not an email client) don't render reliably across real
 * inboxes, Outlook especially — a simple centered table with inline styles
 * does.
 */
export function emailLayout(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5ef;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e4da;">
            <tr>
              <td style="background:#07090b;padding:0;line-height:0;font-size:0;">
                <!-- The dark bar is part of the image: Gmail's dark mode recolours backgrounds but never
                     images, which turned the old light logo on a dark cell into light-on-light. -->
                <img src="${SITE_URL}/brand/email-header.png" width="560" height="88" alt="KiqStat" style="display:block;border:0;width:100%;max-width:560px;height:auto;color:#f2f4ec;font-size:22px;font-weight:800;">
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1a1f1c;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f4f5ef;border-top:1px solid #e1e4da;color:#6b7670;font-size:12px;">
                KiqStat · kiqstat.app
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
