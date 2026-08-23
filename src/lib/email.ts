import "server-only";

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "BetriX <hello@betrix.com.ng>";

function client() {
  if (!apiKey) throw new Error("Resend requires RESEND_API_KEY.");
  return new Resend(apiKey);
}

/**
 * Fire-and-forget by design — every call site does `void sendEmail(...)`,
 * never awaits or wraps it in its own try/catch. Transactional email is
 * additive: a payment, a signup, or an admin's ticket reply must all
 * succeed/ack even if RESEND_API_KEY is unset or Resend's API is down. This
 * function swallows every failure internally and never rejects.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!apiKey) {
    console.error("sendEmail skipped — RESEND_API_KEY not configured:", opts.subject);
    return;
  }
  try {
    await client().emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html });
  } catch (err) {
    console.error("sendEmail failed:", err);
  }
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
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e8ef;">
            <tr>
              <td style="background:#05080d;padding:24px 32px;">
                <span style="font-size:22px;font-weight:800;color:#eef2f7;">Betri<span style="color:#00f48e;">X</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1c2430;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f6f8fb;border-top:1px solid #e3e8ef;color:#8d9db2;font-size:12px;">
                BetriX · betrix.com.ng
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
