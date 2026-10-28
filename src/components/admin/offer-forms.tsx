"use client";

import { useActionState } from "react";
import { saveOffer, setOfferActive, setPlanPrice, type OfferActionState } from "@/app/actions/admin/offers";
import { Button, Spinner } from "@/components/ui/primitives";
import { OFFER_AUDIENCES, type Offer, type OfferAudience } from "@/lib/offers";
import { toLagosInput } from "@/lib/offer-form";

const initial: OfferActionState = { error: null, message: null };

const input =
  "h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-brand focus:ring-2 focus:ring-brand/25";

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-dim">{hint}</span>}
    </label>
  );
}

/**
 * Create or edit an offer: who it's for, what it gives, what it costs, when
 * it runs and what it says. Switching it on is a separate button
 * (OfferSwitch), so saving a draft never puts it in front of anyone.
 */
export function OfferForm({ offer, audience }: { offer?: Offer; audience?: OfferAudience }) {
  const [state, formAction, pending] = useActionState(saveOffer, initial);
  const a = offer?.audience ?? audience ?? "new_visitors";
  return (
    <form action={formAction} className="space-y-4">
      {offer && <input type="hidden" name="id" value={offer.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (admin only)">
          <input name="name" required defaultValue={offer?.name} placeholder="New visitor VIP day pass" className={input} />
        </Field>
        <Field label="Link name" hint="Appears in the address: /offer/<link name>">
          <input name="slug" required defaultValue={offer?.slug} placeholder="vip-day-pass" pattern="[a-z0-9-]{2,40}" className={input} />
        </Field>
        <Field label="Who it's for">
          <select name="audience" defaultValue={a} className={input}>
            {OFFER_AUDIENCES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}: {x.detail}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gives">
          <select name="tier" defaultValue={offer?.tier ?? "vip"} className={input}>
            <option value="vip">VIP (site features, not the WhatsApp chat)</option>
            <option value="pro">Pro</option>
          </select>
        </Field>
        <Field label="Lasts (hours)" hint="24 = a day, 72 = a weekend, 168 = a week">
          <input name="hours" inputMode="numeric" required defaultValue={offer?.hours ?? 24} className={input} />
        </Field>
        <Field label="Price (₦)">
          <input name="price" inputMode="numeric" required defaultValue={offer?.priceNaira ?? 500} className={input} />
        </Field>
        <Field label="Crossed-out price (₦/month)" hint="Optional anchor, e.g. the VIP monthly price">
          <input name="compare" inputMode="numeric" defaultValue={offer?.compareNaira ?? ""} className={input} />
        </Field>
        <Field label="Window (hours)" hint="New visitors: open this long after the first visit. Email: link works this long after sending.">
          <input name="window" inputMode="numeric" defaultValue={offer?.windowHours ?? (a === "free_members" ? "" : 24)} className={input} />
        </Field>
        <Field label="Starts (Lagos time)" hint="Optional">
          <input name="starts" type="datetime-local" defaultValue={toLagosInput(offer?.startsAt ?? null)} className={input} />
        </Field>
        <Field label="Ends (Lagos time)" hint="Optional; shown as the countdown when sooner">
          <input name="ends" type="datetime-local" defaultValue={toLagosInput(offer?.endsAt ?? null)} className={input} />
        </Field>
        <Field label="Buys per account">
          <input name="max" inputMode="numeric" defaultValue={offer?.maxPerAccount ?? 1} className={input} />
        </Field>
        <Field label="Button">
          <input name="cta" defaultValue={offer?.cta ?? "Get VIP"} maxLength={30} className={input} />
        </Field>
        <Field label="Headline" wide>
          <input name="headline" required defaultValue={offer?.headline} maxLength={80} placeholder="VIP for 24 hours" className={input} />
        </Field>
        <Field label="Line under it" wide>
          <input name="subline" defaultValue={offer?.subline ?? ""} maxLength={140} placeholder="Everything, unlocked. One payment, no renewal." className={input} />
        </Field>
        <Field label="What it opens (one per line, up to 6)" wide>
          <textarea name="perks" rows={3} defaultValue={offer?.perks.join("\n")} className={`${input} h-auto py-2`} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner className="size-3.5" />}
          {offer ? "Save" : "Create offer"}
        </Button>
        {state.error && <p className="text-xs text-rose">{state.error}</p>}
        {state.message && <p className="text-xs text-brand">{state.message}</p>}
      </div>
    </form>
  );
}

/** On / off for one offer. Turning a popup offer on turns its audience's other one off. */
export function OfferSwitch({ id, active, label }: { id: string; active: boolean; label: string }) {
  const [state, formAction, pending] = useActionState(setOfferActive, initial);
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        if (!active && !window.confirm(`Switch "${label}" on? It reaches its audience within a minute.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" name="intent" value={active ? "off" : "on"} variant={active ? "secondary" : "primary"} disabled={pending} className="text-xs">
        {pending && <Spinner className="size-3.5" />}
        {active ? "Switch off" : "Switch on"}
      </Button>
      {state.error && <p className="text-xs text-rose">{state.error}</p>}
      {state.message && <p className="text-xs text-brand">{state.message}</p>}
    </form>
  );
}

/** One plan price: a number, or empty to go back to the default. */
export function PriceForm({ tier, cycle, value, placeholder }: { tier: "pro" | "vip"; cycle: string; value: number | null; placeholder: number }) {
  const [state, formAction, pending] = useActionState(setPlanPrice, initial);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="tier" value={tier} />
      <input type="hidden" name="cycle" value={cycle} />
      <input
        name="naira"
        inputMode="numeric"
        defaultValue={value ?? ""}
        placeholder={placeholder.toLocaleString("en-NG")}
        aria-label={`${tier} ${cycle} price in naira`}
        className={`${input} h-9 w-28 font-mono`}
      />
      <Button type="submit" variant="secondary" disabled={pending} className="h-9 px-3 text-xs">
        {pending ? <Spinner className="size-3.5" /> : "Set"}
      </Button>
      {(state.error || state.message) && <span className={`text-[11px] ${state.error ? "text-rose" : "text-brand"}`}>{state.error ?? "Saved"}</span>}
    </form>
  );
}
