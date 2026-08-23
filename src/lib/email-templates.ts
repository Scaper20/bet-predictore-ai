import "server-only";

import { emailLayout } from "@/lib/email";
import { naira } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import type { Tier } from "@/lib/entitlements";

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pass: "Weekend Pass",
  pro: "Pro",
  vip: "VIP",
};

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0;"><a href="${href}" style="display:inline-block;background:#00c97a;color:#05080d;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;">${label}</a></p>`;
}

export function welcomeEmail(): { subject: string; html: string } {
  return {
    subject: "Welcome to BetriX",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Welcome to BetriX</p>
      <p style="margin:0;">Your account is set up. BetriX gives you data-driven football predictions from a
      statistical model fitted on real results — real fixtures, real live scores, no guesswork.</p>
      ${button(SITE_URL, "See today's matches")}
      <p style="margin:24px 0 0;font-size:13px;color:#8d9db2;">Want to know how the model works? Read
      <a href="${SITE_URL}/how-it-works" style="color:#00925c;">how it's calculated</a>.</p>
    `),
  };
}

export function receiptEmail(opts: {
  tier?: Tier;
  amountKobo: number;
  reference: string;
  date: string;
}): { subject: string; html: string } {
  const label = opts.tier ? TIER_LABEL[opts.tier] : undefined;
  const amount = naira(opts.amountKobo / 100);
  const when = new Date(opts.date).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });

  return {
    subject: label ? `Receipt: ${label} payment` : "Receipt: BetriX payment",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Payment received</p>
      <p style="margin:0 0 20px;">${
        label ? `Thanks for subscribing to ${label}.` : "Thanks for your payment."
      } Here's your receipt.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr><td style="padding:6px 0;color:#8d9db2;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:700;">${amount}</td></tr>
        ${label ? `<tr><td style="padding:6px 0;color:#8d9db2;">Plan</td><td style="padding:6px 0;text-align:right;">${label}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#8d9db2;">Date</td><td style="padding:6px 0;text-align:right;">${when}</td></tr>
        <tr><td style="padding:6px 0;color:#8d9db2;">Reference</td><td style="padding:6px 0;text-align:right;">${opts.reference}</td></tr>
      </table>
      ${button(`${SITE_URL}/account/billing`, "View billing")}
    `),
  };
}

export function ticketReplyNotificationEmail(opts: { subject: string }): { subject: string; html: string } {
  return {
    subject: "An admin replied to your support request",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">You have a reply</p>
      <p style="margin:0;">An admin replied to your support request, "${opts.subject}".</p>
      ${button(SITE_URL, "Open BetriX")}
      <p style="margin:24px 0 0;font-size:13px;color:#8d9db2;">Reply from the chat icon in the bottom corner of the site.</p>
    `),
  };
}

export function subscriptionCanceledEmail(opts: {
  tier?: Tier;
  accessUntil?: string | null;
}): { subject: string; html: string } {
  const label = opts.tier ? TIER_LABEL[opts.tier] : "subscription";
  const until = opts.accessUntil
    ? new Date(opts.accessUntil).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return {
    subject: "Your BetriX subscription was canceled",
    html: emailLayout(`
      <p style="margin:0 0 12px;font-size:17px;font-weight:700;">Subscription canceled</p>
      <p style="margin:0;">Your ${label} subscription has been canceled. ${
        until ? `You'll keep access until ${until}.` : "You'll keep access until the end of your current billing period."
      }</p>
      ${button(`${SITE_URL}/account/billing`, "Resubscribe")}
    `),
  };
}
