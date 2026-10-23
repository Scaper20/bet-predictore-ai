"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MAX_RATE_BPS, minPayout, moneyText, slugify, validSlug } from "@/lib/partners";
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
  const gate = await checkAdmin();
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
    .insert({ slug, name, email, user_id: account?.id ?? null, rate_bps: rateBps, notes: clean(formData.get("notes"), 500) || null, ...bankFields(formData) })
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

/** Edits a partner. A new rate applies to payments from now on; earned commissions keep their own rate. */
export async function updatePartner(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  if (!UUID.test(id)) return { error: "Unknown partner.", message: null };

  const name = clean(formData.get("name"), 120);
  const rateBps = rateFromPercent(clean(formData.get("ratePercent"), 8));
  if (!name) return { error: "Enter the partner's name.", message: null };
  if (rateBps === null) return { error: `The rate must be between 0% and ${MAX_RATE_BPS / 100}%.`, message: null };

  const account = await accountByEmail(clean(formData.get("accountEmail"), 200));
  if (account === "missing") return { error: "No KiqStat account has that email.", message: null };

  const { error } = await supabaseAdmin()
    .from("partners")
    .update({
      name,
      email: clean(formData.get("email"), 200).toLowerCase() || null,
      user_id: account?.id ?? null,
      rate_bps: rateBps,
      notes: clean(formData.get("notes"), 500) || null,
      updated_at: new Date().toISOString(),
      ...bankFields(formData),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That account is already linked to another partner.", message: null };
    return { error: "Couldn't save. Try again.", message: null };
  }

  await logAdminAction(gate.identity, "partner.updated", id, { rateBps });
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  return { error: null, message: "Saved." };
}

export async function setPartnerStatus(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  const status = clean(formData.get("status"), 12);
  if (!UUID.test(id) || (status !== "active" && status !== "suspended")) return { error: "Unknown partner.", message: null };

  const { error } = await supabaseAdmin().from("partners").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Couldn't update. Try again.", message: null };

  await logAdminAction(gate.identity, `partner.${status === "active" ? "reactivated" : "suspended"}`, id);
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  return { error: null, message: status === "active" ? "Partner reactivated." : "Partner suspended. New payments earn nothing and payouts are blocked." };
}

/** Pays one partner's payable balance in one currency: records the payout and marks its commissions paid. */
export async function payOutPartner(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const id = clean(formData.get("id"), 40);
  const currency = clean(formData.get("currency"), 3).toUpperCase();
  if (!UUID.test(id) || !/^[A-Z]{3}$/.test(currency)) return { error: "Unknown partner or currency.", message: null };

  const { data, error } = await supabaseAdmin().rpc("partner_pay_out", {
    p_partner: id,
    p_currency: currency,
    p_reference: clean(formData.get("reference"), 120),
    p_note: clean(formData.get("note"), 300),
    p_min_minor: minPayout(currency),
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
  const gate = await checkAdmin();
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
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const partnerId = clean(formData.get("partnerId"), 40);
  const email = clean(formData.get("email"), 254).toLowerCase();
  if (!UUID.test(partnerId)) return { error: "Unknown partner.", message: null };
  if (!email) return { error: "Enter the account's email.", message: null };

  const admin = supabaseAdmin();
  const [{ data: partner }, { data: profile }] = await Promise.all([
    admin.from("partners").select("id, slug, user_id, created_at").eq("id", partnerId).maybeSingle(),
    admin.from("profiles").select("id, created_at, referred_by_partner").ilike("email", email).maybeSingle(),
  ]);
  if (!partner) return { error: "Unknown partner.", message: null };
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

  const { data: updated, error } = await admin
    .from("profiles")
    .update({ referred_by_partner: partner.id, referred_at: new Date().toISOString() })
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
