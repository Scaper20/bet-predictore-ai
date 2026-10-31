"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseOfferForm } from "@/lib/offer-form";
import { enqueueCampaign, sendNextBatch } from "@/lib/outreach-feed";
import { offerCampaign } from "@/lib/offers";
import type { BillingCycle } from "@/lib/pricing";

export type OfferActionState = { error: string | null; message: string | null };

const PAGE = "/admin/offers";

/**
 * Creates an offer, or saves one (form field `id`). Copy, price, length,
 * window and dates; switching it on and off is setOfferActive. The site
 * reads offers through a one-minute cache (offers-server.ts), so an edit
 * reaches every visitor within a minute.
 */
export async function saveOffer(_prev: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const gate = await checkPermission("offers.manage");
  if (!gate.ok) return { error: gate.error, message: null };
  const parsed = parseOfferForm(formData);
  if (!parsed.ok) return { error: parsed.error, message: null };
  const o = parsed.offer;
  const id = typeof formData.get("id") === "string" && formData.get("id") ? String(formData.get("id")) : null;

  const row = {
    slug: o.slug,
    name: o.name,
    audience: o.audience,
    tier: o.tier,
    hours: o.hours,
    price_naira: o.priceNaira,
    compare_naira: o.compareNaira,
    window_hours: o.windowHours,
    starts_at: o.startsAt,
    ends_at: o.endsAt,
    max_per_account: o.maxPerAccount,
    headline: o.headline,
    subline: o.subline,
    cta: o.cta,
    perks: o.perks,
    updated_at: new Date().toISOString(),
    updated_by: gate.identity.id,
  };
  const db = supabaseAdmin().from("offers");
  const { error } = id ? await db.update(row).eq("id", id) : await db.insert({ ...row, active: false });
  if (error) {
    if (error.code === "23505" && error.message.includes("slug")) return { error: "Another offer already uses that link name.", message: null };
    if (error.code === "23505") return { error: "Another offer for this audience is on. Switch it off first.", message: null };
    return { error: "Couldn't save. Try again.", message: null };
  }
  await logAdminAction(gate.identity, id ? "offer.updated" : "offer.created", o.slug, { price: o.priceNaira, hours: o.hours, audience: o.audience });
  revalidatePath(PAGE);
  return { error: null, message: id ? "Saved. Live on the site within a minute." : "Created, switched off. Switch it on when it's ready." };
}

/**
 * Switches an offer on or off. A popup audience has one live offer at a
 * time, so switching one on switches off whichever was on before.
 */
export async function setOfferActive(_prev: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const gate = await checkPermission("offers.manage");
  if (!gate.ok) return { error: gate.error, message: null };
  const id = String(formData.get("id") ?? "");
  const on = formData.get("intent") === "on";
  const admin = supabaseAdmin();
  const { data: offer } = await admin.from("offers").select("slug, audience").eq("id", id).maybeSingle();
  if (!offer) return { error: "That offer no longer exists.", message: null };

  let replaced: string | null = null;
  if (on && offer.audience !== "email") {
    const { data: previous } = await admin.from("offers").update({ active: false }).eq("audience", offer.audience).eq("active", true).neq("id", id).select("name");
    replaced = previous?.[0]?.name ?? null;
  }
  const { error } = await admin.from("offers").update({ active: on, updated_at: new Date().toISOString(), updated_by: gate.identity.id }).eq("id", id);
  if (error) return { error: "Couldn't switch it. Try again.", message: null };
  await logAdminAction(gate.identity, on ? "offer.switched_on" : "offer.switched_off", offer.slug as string);
  revalidatePath(PAGE);
  return {
    error: null,
    message: on ? `On. Visitors see it within a minute.${replaced ? ` "${replaced}" is now off.` : ""}` : "Off. It leaves the site within a minute.",
  };
}

/** The offer's slug from the send panel's `campaign` field ("offer:<slug>"). */
function slugOf(formData: FormData): string | null {
  const m = String(formData.get("campaign") ?? "").match(/^offer:([a-z0-9-]{2,40})$/);
  return m ? m[1] : null;
}

type QueueState = OfferActionState & { enqueued: number | null };

/** Queues every free member for an email offer (only those not already queued). */
export async function queueOfferEmail(_prev: QueueState, formData: FormData): Promise<QueueState> {
  const gate = await checkPermission("offers.manage");
  if (!gate.ok) return { error: gate.error, message: null, enqueued: null };
  const slug = slugOf(formData);
  if (!slug) return { error: "Unknown offer.", message: null, enqueued: null };
  const { enqueued, error } = await enqueueCampaign(offerCampaign(slug));
  if (error) return { error, message: null, enqueued: null };
  await logAdminAction(gate.identity, "offer.email_queued", slug, { enqueued });
  return {
    error: null,
    message: enqueued > 0 ? `Queued ${enqueued} free member${enqueued === 1 ? "" : "s"}.` : "Nobody new to queue.",
    enqueued,
  };
}

export type OfferBatchState = { sent: number; failed: number; remaining: number; error: string | null };

/** Sends the next small batch of an email offer; the panel calls it again while any remain. */
export async function sendOfferBatch(_prev: OfferBatchState, formData: FormData): Promise<OfferBatchState> {
  const gate = await checkPermission("offers.manage");
  if (!gate.ok) return { sent: 0, failed: 0, remaining: 0, error: gate.error };
  const slug = slugOf(formData);
  if (!slug) return { sent: 0, failed: 0, remaining: 0, error: "Unknown offer." };
  // Ten at a time, as the outreach panel does, to stay inside the default function time limit.
  const result = await sendNextBatch(offerCampaign(slug), 10);
  if (result.sent > 0 || result.failed > 0) await logAdminAction(gate.identity, "offer.email_batch", slug, { ...result });
  return { ...result, error: null };
}

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "yearly"];

/**
 * Sets (or, left empty, resets to the default) Nigeria's price for one plan
 * and cycle. Pages that show prices pick it up within a minute; the static
 * pricing and home pages are rebuilt now.
 */
export async function setPlanPrice(_prev: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const gate = await checkPermission("pricing.manage");
  if (!gate.ok) return { error: gate.error, message: null };
  const tier = formData.get("tier");
  const cycle = formData.get("cycle") as BillingCycle;
  if ((tier !== "pro" && tier !== "vip") || !CYCLES.includes(cycle)) return { error: "Unknown plan.", message: null };
  const raw = String(formData.get("naira") ?? "").replace(/[,\s₦]/g, "");
  const admin = supabaseAdmin();

  if (raw === "") {
    await admin.from("plan_prices").delete().eq("tier", tier).eq("cycle", cycle);
    await logAdminAction(gate.identity, "pricing.reset", `${tier}:${cycle}`);
  } else {
    const naira = Number(raw);
    if (!Number.isInteger(naira) || naira < 100 || naira > 10_000_000) return { error: "A price is a whole number of naira, ₦100 or more.", message: null };
    const { error } = await admin
      .from("plan_prices")
      .upsert({ tier, cycle, naira, updated_at: new Date().toISOString(), updated_by: gate.identity.id }, { onConflict: "tier,cycle" });
    if (error) return { error: "Couldn't save. Try again.", message: null };
    await logAdminAction(gate.identity, "pricing.set", `${tier}:${cycle}`, { naira });
  }
  revalidatePath(PAGE);
  revalidatePath("/pricing");
  revalidatePath("/");
  return { error: null, message: raw === "" ? "Back to the default price." : "Saved. Prices on the site update within a minute." };
}
