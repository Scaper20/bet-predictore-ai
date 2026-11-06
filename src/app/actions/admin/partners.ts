"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MAX_RATE_BPS, minPayout, moneyText, pctText, slugify, validSlug } from "@/lib/partners";
import { isTerminated, planRateChange, planTermination } from "@/lib/partner-terms";
import { sendEmail } from "@/lib/email";
import { creditPastPayments } from "@/lib/partner-attribution";

export type PartnerActionState = { error: string | null; message: string | null };

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

/** A percent typed as "20" or "17.5" into basis points; null when it is not a rate we allow. */
function rateFromPercent(raw: string): number | null {
  const pct = Number(raw);
  if (!Number.isFinite(pct)) return null;
  const bps = Math.round(pct * 100);
  return bps >= 0 && bps <= MAX_RATE_BPS ? bps : null;
}

function bankFields(formData: FormData) {
  const accountNumber = clean(formData.get("accountNumber"), 20).replace(/\s+/g, "") || null;
  return {
    bank_name: clean(formData.get("bankName"), 80) || null,
    account_number: accountNumber,
    account_name: clean(formData.get("accountName"), 120) || null,
  };
}

/** The KiqStat account (by email) a partner signs in with, or null when none is typed. */
async function accountByEmail(email: string): Promise<{ id: string } | "missing" | null> {
  if (!email) return null;
  const { data } = await supabaseAdmin().from("profiles").select("id").ilike("email", email).maybeSingle();
  return data ? { id: data.id as string } : "missing";
}

export async function createPartner(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const name = clean(formData.get("name"), 120);
  const slug = slugify(clean(formData.get("slug"), 60) || name);
  const email = clean(formData.get("email"), 200).toLowerCase() || null;
  const rateBps = rateFromPercent(clean(formData.get("ratePercent"), 8) || "20");

  if (!name) return { error: "Enter the partner's name.", message: null };
  if (!validSlug(slug)) return { error: "The link name needs 3 to 32 letters, numbers or single hyphens.", message: null };
  if (rateBps === null) return { error: `The rate must be between 0% and ${MAX_RATE_BPS / 100}%.`, message: null };

  const account = await accountByEmail(clean(formData.get("accountEmail"), 200));
  if (account === "missing") return { error: "No KiqStat account has that email. They need to sign up first.", message: null };

  const { data, error } = await supabaseAdmin()
    .from("partners")
    .insert({ slug, name, email, user_id: account?.id ?? null, rate_bps: rateBps, activated_at: new Date().toISOString(), notes: clean(formData.get("notes"), 500) || null, ...bankFields(formData) })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { error: "That link name or account is already taken.", message: null };
    return { error: "Couldn't create the partner. Try again.", message: null };
  }

  await logAdminAction(gate.identity, "partner.created", slug, { rateBps });
  revalidatePath("/admin/partners");
  redirect(`/admin/partners/${data.id}`);
}

/**
 * Edits a partner's details. The rate is not edited here: a change goes through
 * scheduleRateChange so it carries a notice and reaches only new customers (agreement clause 4.6).
 */
export async function updatePartner(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  if (!UUID.test(id)) return { error: "Unknown partner.", message: null };

  const name = clean(formData.get("name"), 120);
  if (!name) return { error: "Enter the partner's name.", message: null };

  const account = await accountByEmail(clean(formData.get("accountEmail"), 200));
  if (account === "missing") return { error: "No KiqStat account has that email.", message: null };

  const { error } = await supabaseAdmin()
    .from("partners")
    .update({
      name,
      email: clean(formData.get("email"), 200).toLowerCase() || null,
      user_id: account?.id ?? null,
      notes: clean(formData.get("notes"), 500) || null,
      updated_at: new Date().toISOString(),
      ...bankFields(formData),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That account is already linked to another partner.", message: null };
    return { error: "Couldn't save. Try again.", message: null };
  }

  await logAdminAction(gate.identity, "partner.updated", id);
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  return { error: null, message: "Saved." };
}

export async function setPartnerStatus(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  const status = clean(formData.get("status"), 12);
  if (!UUID.test(id) || (status !== "active" && status !== "suspended")) return { error: "Unknown partner.", message: null };

  const { data: current } = await supabaseAdmin().from("partners").select("status").eq("id", id).maybeSingle();
  if (current?.status === "terminated") return { error: "A terminated partner can't be reactivated here. Sign a new agreement and ask for it to be set up again.", message: null };
  const { error } = await supabaseAdmin().from("partners").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Couldn't update. Try again.", message: null };

  await logAdminAction(gate.identity, `partner.${status === "active" ? "reactivated" : "suspended"}`, id);
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  return { error: null, message: status === "active" ? "Partner reactivated." : "Partner suspended. New payments earn nothing and payouts are blocked." };
}

/** Pays one partner's payable balance in one currency: records the payout and marks its commissions paid. */
export async function payOutPartner(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.payout");
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  const currency = clean(formData.get("currency"), 3).toUpperCase();
  if (!UUID.test(id) || !/^[A-Z]{3}$/.test(currency)) return { error: "Unknown partner or currency.", message: null };

  // After termination takes effect the partner is paid whatever is payable, with no minimum (agreement clause 11.4).
  const { data: pt } = await supabaseAdmin().from("partners").select("terminated_at").eq("id", id).maybeSingle();
  const ended = isTerminated(pt?.terminated_at ? new Date(pt.terminated_at as string) : null, new Date());
  const { data, error } = await supabaseAdmin().rpc("partner_pay_out", {
    p_partner: id,
    p_currency: currency,
    p_reference: clean(formData.get("reference"), 120),
    p_note: clean(formData.get("note"), 300),
    p_min_minor: ended ? 0 : minPayout(currency),
    p_admin_email: gate.identity.email,
  });
  if (error) {
    return { error: error.message.includes("suspended") ? "This partner is suspended." : "Couldn't record the payout. Nothing was changed.", message: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: "Nothing to pay: the payable balance is empty or below the minimum.", message: null };

  const total = Number(row.total_minor);
  await logAdminAction(gate.identity, "partner.paid_out", id, { currency, totalMinor: total, commissions: row.commissions });
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  return { error: null, message: `Recorded a payout of ${moneyText(total, currency)} (${row.commissions} commissions).` };
}

/** Reverses one commission after a refund or chargeback. A paid one leaves a clawback on the next payout. */
export async function reverseCommission(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.payout");
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  const partnerId = clean(formData.get("partnerId"), 40);
  const reason = clean(formData.get("reason"), 200);
  if (!UUID.test(id) || !UUID.test(partnerId)) return { error: "Unknown commission.", message: null };
  if (!reason) return { error: "Say why (refund, chargeback…).", message: null };

  const { data, error } = await supabaseAdmin().rpc("partner_reverse_commission", { p_commission: id, p_reason: reason });
  if (error) return { error: "Couldn't reverse it. Nothing was changed.", message: null };

  await logAdminAction(gate.identity, "partner.commission_reversed", id, { partnerId, reason, result: data });
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${partnerId}`);
  return {
    error: null,
    message:
      data === "clawback"
        ? "Reversed. It was already paid, so a deduction will come off the next payout."
        : data === "cancelled"
          ? "Reversed before payout. The partner won't be paid it."
          : "Already reversed.",
  };
}

/**
 * Credits an existing account to a partner by hand, for a referral the site
 * missed (before the October 2026 fix, Google sign-ins were never credited).
 * Then pays the partner's share of everything that account has already paid.
 *
 * Refuses an account already credited to anyone, the partner's own account,
 * and one created before the partner existed, which can't have come through
 * their link.
 */
export async function creditAccountToPartner(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const partnerId = clean(formData.get("partnerId"), 40);
  const email = clean(formData.get("email"), 254).toLowerCase();
  if (!UUID.test(partnerId)) return { error: "Unknown partner.", message: null };
  if (!email) return { error: "Enter the account's email.", message: null };

  const admin = supabaseAdmin();
  const [{ data: partner }, { data: profile }] = await Promise.all([
    admin.from("partners").select("id, slug, user_id, created_at, status").eq("id", partnerId).maybeSingle(),
    admin.from("profiles").select("id, created_at, referred_by_partner").ilike("email", email).maybeSingle(),
  ]);
  if (!partner) return { error: "Unknown partner.", message: null };
  if (partner.status === "terminated" || partner.status === "suspended") return { error: `This partner is ${partner.status}, so no new account can be credited.`, message: null };
  if (!profile) return { error: "No account with that email.", message: null };
  if (profile.id === partner.user_id) return { error: "That's the partner's own account.", message: null };
  if (profile.referred_by_partner) {
    return {
      error: profile.referred_by_partner === partner.id ? "Already credited to this partner." : "Already credited to another partner.",
      message: null,
    };
  }
  if (Date.parse(profile.created_at as string) < Date.parse(partner.created_at as string)) {
    return { error: "That account was created before this partner joined, so it can't have come through their link.", message: null };
  }

  const { data: rateRow } = await admin.from("partners").select("rate_bps").eq("id", partner.id).maybeSingle();
  const partnerRate = (rateRow?.rate_bps as number | undefined) ?? 2000;
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ referred_by_partner: partner.id, referred_at: new Date().toISOString(), referred_rate_bps: partnerRate })
    .eq("id", profile.id)
    .is("referred_by_partner", null)
    .select("id");
  if (error || !updated?.length) return { error: "Couldn't credit it. Nothing was changed.", message: null };

  const payments = await creditPastPayments(profile.id as string);
  await logAdminAction(gate.identity, "partner.signup_credited", partner.id as string, { userId: profile.id, payments });
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${partner.id}`);
  return {
    error: null,
    message: payments > 0 ? `Credited, with commission on ${payments} past payment${payments === 1 ? "" : "s"}.` : "Credited. Their future payments will earn commission.",
  };
}

/* ---------------------------------------------------- rate changes and terminations */

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

/** Sends the partner a written notice (agreement clause 15.1) and the founder a copy. Returns whether the partner had an address. */
async function sendNotice(partner: { name: string; email: string | null }, subject: string, paragraphs: string[], key: string): Promise<boolean> {
  const html = `<p>Dear ${partner.name},</p>${paragraphs.map((p) => `<p>${p}</p>`).join("")}<p>KiqStat</p>`;
  const copyTo = process.env.ASK_ALERT_EMAIL?.trim() || process.env.SUPPORT_INBOX_EMAIL?.trim() || "support@kiqstat.app";
  if (partner.email) await sendEmail({ to: partner.email, subject, html, idempotencyKey: `partner-notice:${key}` }).catch(() => null);
  await sendEmail({ to: copyTo, subject: `Copy: ${subject} (${partner.name})${partner.email ? "" : " - NO PARTNER EMAIL ON FILE, send it yourself"}`, html, idempotencyKey: `partner-notice-copy:${key}` }).catch(() => null);
  return Boolean(partner.email);
}

/**
 * Schedules a rate change (agreement clause 4.6): 30 days' notice, or at once with the partner's
 * written agreement. It reaches only customers attributed on or after the effective date; customers
 * already attributed keep the rate they started on.
 */
export async function scheduleRateChange(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  if (!UUID.test(id)) return { error: "Unknown partner.", message: null };
  const newBps = rateFromPercent(clean(formData.get("ratePercent"), 8));
  if (newBps === null) return { error: `The rate must be between 0% and ${MAX_RATE_BPS / 100}%.`, message: null };
  const agreed = formData.get("agreed") === "on";
  const reason = clean(formData.get("reason"), 300);
  const dateRaw = clean(formData.get("effectiveDate"), 12);

  const admin = supabaseAdmin();
  await admin.rpc("partner_apply_rate_changes");
  const { data: partner } = await admin.from("partners").select("id, name, email, rate_bps, status, terminated_at").eq("id", id).maybeSingle();
  if (!partner) return { error: "Unknown partner.", message: null };
  if (partner.status === "terminated") return { error: "This partner is terminated.", message: null };

  const now = new Date();
  const plan = planRateChange({
    currentBps: partner.rate_bps as number,
    newBps,
    now,
    agreedInWriting: agreed,
    requestedEffectiveAt: dateRaw ? new Date(`${dateRaw}T00:00:00+01:00`) : null,
  });
  if (!plan.ok) return { error: plan.error, message: null };

  const { error } = await admin.from("partner_rate_changes").insert({
    partner_id: id,
    from_bps: partner.rate_bps,
    to_bps: newBps,
    notified_at: now.toISOString(),
    effective_at: plan.effectiveAt.toISOString(),
    reason: reason || null,
    agreed_in_writing: agreed,
    created_by_email: gate.identity.email,
  });
  if (error) return { error: "Couldn't schedule it. Nothing was changed.", message: null };
  await admin.rpc("partner_apply_rate_changes");

  const upOrDown = newBps > (partner.rate_bps as number) ? "increase" : "decrease";
  const hadEmail = await sendNotice(
    { name: partner.name as string, email: (partner.email as string | null) ?? null },
    `Change to your KiqStat commission rate from ${day(plan.effectiveAt)}`,
    [
      `This is notice under clause 4.6 of your Partner Referral Agreement that your commission rate will ${upOrDown} from ${pctText(partner.rate_bps as number)} to ${pctText(newBps)} of Net Payment, from ${day(plan.effectiveAt)}.`,
      "The new rate applies to customers first attributed to you on or after that date. Customers already attributed to you keep the rate they started on for the rest of their 12-month earning period.",
      ...(agreed ? ["This change has been agreed with you in writing."] : ["If you do not accept the change, you may end the agreement on 30 days' written notice under clause 11."]),
    ],
    `${id}:rate:${plan.effectiveAt.toISOString()}:${newBps}`,
  );

  await logAdminAction(gate.identity, "partner.rate_change_scheduled", id, { from: partner.rate_bps, to: newBps, effectiveAt: plan.effectiveAt.toISOString(), agreed });
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  const when = plan.effectiveAt.getTime() <= now.getTime() ? "from now" : `from ${day(plan.effectiveAt)}`;
  return { error: null, message: `Rate ${upOrDown} to ${pctText(newBps)} ${when}, for new customers only. ${hadEmail ? "The partner has been sent the notice." : "No partner email is on file: send the notice yourself (a copy is in the support inbox)."}` };
}

/** Cancels a rate change that has not taken effect yet. */
export async function cancelRateChange(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };
  const id = clean(formData.get("id"), 40);
  const partnerId = clean(formData.get("partnerId"), 40);
  if (!UUID.test(id) || !UUID.test(partnerId)) return { error: "Unknown change.", message: null };
  const { data } = await supabaseAdmin()
    .from("partner_rate_changes")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("partner_id", partnerId)
    .is("applied_at", null)
    .is("cancelled_at", null)
    .select("id");
  if (!data?.length) return { error: "That change has already taken effect or was cancelled.", message: null };
  await logAdminAction(gate.identity, "partner.rate_change_cancelled", partnerId, { changeId: id });
  revalidatePath(`/admin/partners/${partnerId}`);
  return { error: null, message: "Cancelled. Tell the partner, since they were sent a notice." };
}

/**
 * Terminates a partner (agreement clause 11). Without cause it takes effect after 30 days' notice (7
 * in the pilot); for cause, at once. From then on no new account is credited, and only customers who
 * had already paid keep earning, to the end of their own 12 months. The partner is paid what is
 * payable with no minimum.
 */
export async function terminatePartner(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  if (!UUID.test(id)) return { error: "Unknown partner.", message: null };
  const forCause = formData.get("forCause") === "on";
  const reason = clean(formData.get("reason"), 300);

  const admin = supabaseAdmin();
  const { data: partner } = await admin.from("partners").select("id, name, email, status, activated_at, terminated_at").eq("id", id).maybeSingle();
  if (!partner) return { error: "Unknown partner.", message: null };
  if (partner.terminated_at) return { error: "This partner already has a termination set.", message: null };

  const now = new Date();
  const plan = planTermination({ now, activatedAt: partner.activated_at ? new Date(partner.activated_at as string) : null, forCause, reason });
  if (!plan.ok) return { error: plan.error, message: null };

  const effectiveNow = plan.effectiveAt.getTime() <= now.getTime();
  const { error } = await admin
    .from("partners")
    .update({
      termination_notice_at: now.toISOString(),
      terminated_at: plan.effectiveAt.toISOString(),
      termination_reason: reason,
      termination_for_cause: forCause,
      ...(effectiveNow ? { status: "terminated" } : {}),
      updated_at: now.toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Couldn't terminate. Nothing was changed.", message: null };
  // Pending rate changes die with the partner.
  await admin.from("partner_rate_changes").update({ cancelled_at: now.toISOString() }).eq("partner_id", id).is("applied_at", null).is("cancelled_at", null);

  const hadEmail = await sendNotice(
    { name: partner.name as string, email: (partner.email as string | null) ?? null },
    effectiveNow ? "Your KiqStat Partner Referral Agreement has ended" : `Notice of termination of your KiqStat Partner Referral Agreement from ${day(plan.effectiveAt)}`,
    [
      effectiveNow
        ? "This is notice under clause 11 of your Partner Referral Agreement that it has ended with immediate effect."
        : `This is notice under clause 11 of your Partner Referral Agreement that it will end on ${day(plan.effectiveAt)}.`,
      `Reason: ${reason}`,
      "From the termination date no new accounts are credited to you. Commission on customers who had already made a first payment before that date continues to the end of each customer's 12-month earning period (clause 11.3), and any balance payable is paid monthly with no minimum (clause 11.4).",
      ...(forCause ? ["Commission on customers acquired through the conduct that led to this termination may be forfeited (clause 11.3)."] : []),
      "You must stop using your referral link and KiqStat branding (clause 11.2).",
    ],
    `${id}:terminate`,
  );

  await logAdminAction(gate.identity, "partner.terminated", id, { forCause, effectiveAt: plan.effectiveAt.toISOString(), reason });
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  return {
    error: null,
    message: `${effectiveNow ? "Terminated now." : `Termination set for ${day(plan.effectiveAt)} (${plan.noticeDays} days' notice).`} ${hadEmail ? "The partner has been sent the notice." : "No partner email is on file: send the notice yourself (a copy is in the support inbox)."}`,
  };
}

/**
 * Forfeits the commission on one referral (clause 11.3, termination for breach or fraud): later
 * payments from that customer earn nothing, and commissions already booked are reversed (a paid one
 * leaves a clawback on the next payout).
 */
export async function forfeitReferral(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkPermission("partners.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const partnerId = clean(formData.get("partnerId"), 40);
  const email = clean(formData.get("email"), 254).toLowerCase();
  const reason = clean(formData.get("reason"), 300);
  if (!UUID.test(partnerId)) return { error: "Unknown partner.", message: null };
  if (!email || !reason) return { error: "Enter the account's email and the reason.", message: null };

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("id, referred_by_partner").ilike("email", email).maybeSingle();
  if (!profile || profile.referred_by_partner !== partnerId) return { error: "That account isn't one of this partner's referrals.", message: null };

  const { error } = await admin.from("partner_forfeitures").upsert({ partner_id: partnerId, user_id: profile.id, reason, created_by_email: gate.identity.email }, { onConflict: "partner_id,user_id" });
  if (error) return { error: "Couldn't record it. Nothing was changed.", message: null };

  const { data: open } = await admin.from("partner_commissions").select("id").eq("partner_id", partnerId).eq("user_id", profile.id).eq("kind", "commission").neq("status", "reversed");
  let reversed = 0;
  for (const c of open ?? []) {
    const { error: e } = await admin.rpc("partner_reverse_commission", { p_commission: c.id as string, p_reason: `forfeited: ${reason}` });
    if (!e) reversed++;
  }
  await logAdminAction(gate.identity, "partner.referral_forfeited", partnerId, { userId: profile.id, reason, reversed });
  revalidatePath(`/admin/partners/${partnerId}`);
  return { error: null, message: `Forfeited. ${reversed} commission${reversed === 1 ? "" : "s"} reversed; later payments from this customer earn nothing.` };
}
