"use client";

import { useActionState } from "react";
import {
  cancelRateChange,
  createPartner,
  creditAccountToPartner,
  forfeitReferral,
  scheduleRateChange,
  terminatePartner,
  payOutPartner,
  reverseCommission,
  setPartnerStatus,
  updatePartner,
  type PartnerActionState,
} from "@/app/actions/admin/partners";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";

const initial: PartnerActionState = { error: null, message: null };

function Result({ state }: { state: PartnerActionState }) {
  if (state.error) return <p className="text-xs text-rose">{state.error}</p>;
  if (state.message) return <p className="text-xs text-brand">{state.message}</p>;
  return null;
}

interface PartnerDefaults {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  accountEmail: string | null;
  ratePercent: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  notes: string | null;
}

/** Create (no `partner`) or edit a partner. The link name is fixed once created, because it is in links already shared. */
export function PartnerForm({ partner }: { partner?: PartnerDefaults }) {
  const [state, action, pending] = useActionState(partner ? updatePartner : createPartner, initial);
  const key = partner?.id ?? "new";

  return (
    <form action={action} className="card space-y-4 p-5">
      {partner && <input type="hidden" name="id" value={partner.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`p-name-${key}`}>
          <Input id={`p-name-${key}`} name="name" defaultValue={partner?.name} required maxLength={120} />
        </Field>
        {partner ? (
          <Field label="Link name" htmlFor={`p-slug-${key}`} hint="Fixed: it is already in the links they share.">
            <Input id={`p-slug-${key}`} value={partner.slug} readOnly disabled />
          </Field>
        ) : (
          <Field label="Link name" htmlFor={`p-slug-${key}`} hint="Becomes kiqstat.app/?ref=name. Leave blank to use the partner's name.">
            <Input id={`p-slug-${key}`} name="slug" maxLength={32} placeholder="ada-tips" />
          </Field>
        )}
        <Field label="Contact email" htmlFor={`p-email-${key}`}>
          <Input id={`p-email-${key}`} name="email" type="email" defaultValue={partner?.email ?? ""} />
        </Field>
        <Field label="KiqStat account email" htmlFor={`p-acct-${key}`} hint="The account they sign in with to see their dashboard. Optional for now.">
          <Input id={`p-acct-${key}`} name="accountEmail" type="email" defaultValue={partner?.accountEmail ?? ""} />
        </Field>
        {partner ? (
          <Field label="Commission rate" htmlFor={`p-rate-${key}`} hint="Change it with “Change the rate” below, which sends the notice.">
            <Input id={`p-rate-${key}`} value={`${partner.ratePercent}%`} readOnly disabled />
          </Field>
        ) : (
          <Field label="Commission rate (%)" htmlFor={`p-rate-${key}`} hint="The standard rate is 20%. Never above 30%.">
            <Input id={`p-rate-${key}`} name="ratePercent" type="number" min={0} max={30} step="0.5" defaultValue="20" required />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bank" htmlFor={`p-bank-${key}`}>
          <Input id={`p-bank-${key}`} name="bankName" defaultValue={partner?.bankName ?? ""} maxLength={80} />
        </Field>
        <Field label="Account number" htmlFor={`p-num-${key}`}>
          <Input id={`p-num-${key}`} name="accountNumber" inputMode="numeric" defaultValue={partner?.accountNumber ?? ""} maxLength={20} />
        </Field>
        <Field label="Account name" htmlFor={`p-acctname-${key}`}>
          <Input id={`p-acctname-${key}`} name="accountName" defaultValue={partner?.accountName ?? ""} maxLength={120} />
        </Field>
      </div>

      <Field label="Notes" htmlFor={`p-notes-${key}`}>
        <Textarea id={`p-notes-${key}`} name="notes" rows={2} maxLength={500} defaultValue={partner?.notes ?? ""} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : partner ? "Save changes" : "Create partner"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function PartnerStatusForm({ id, status }: { id: string; status: "active" | "suspended" }) {
  const [state, action, pending] = useActionState(setPartnerStatus, initial);
  const next = status === "active" ? "suspended" : "active";
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <Button type="submit" variant={status === "active" ? "danger" : "secondary"} disabled={pending} className="px-4 py-2 text-xs">
        {status === "active" ? "Suspend partner" : "Reactivate partner"}
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Records a bank transfer already made (or about to be) and marks the payable commissions paid. */
export function PayoutForm({ id, currency, amountText }: { id: string; currency: string; amountText: string }) {
  const [state, action, pending] = useActionState(payOutPartner, initial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="currency" value={currency} />
      <Input name="reference" placeholder="Transfer reference (optional)" maxLength={120} aria-label="Transfer reference" />
      <Button type="submit" variant="primary" disabled={pending} className="w-full px-4 py-2 text-xs">
        {pending ? "Recording…" : `Mark ${amountText} paid`}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function ReverseForm({ id, partnerId }: { id: string; partnerId: string }) {
  const [state, action, pending] = useActionState(reverseCommission, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="partnerId" value={partnerId} />
      <Input name="reason" placeholder="Reason, e.g. refunded" maxLength={200} aria-label="Reason" className="w-44 py-1.5 text-xs" required />
      <Button type="submit" variant="ghost" disabled={pending} className="px-3 py-1.5 text-xs">
        Reverse
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Credits a missed referral to this partner by the account's email. */
export function CreditSignupForm({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(creditAccountToPartner, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="partnerId" value={partnerId} />
      <Input name="email" type="email" placeholder="Their account email" aria-label="Account email" className="w-64 py-1.5 text-xs" required />
      <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-1.5 text-xs">
        Credit to this partner
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Schedules a rate change for new customers: 30 days' notice, or at once with the partner's written agreement. */
export function RateChangeForm({ partnerId, currentPercent }: { partnerId: string; currentPercent: string }) {
  const [state, action, pending] = useActionState(scheduleRateChange, initial);
  return (
    <form action={action} className="card space-y-3 p-5">
      <input type="hidden" name="id" value={partnerId} />
      <div>
        <h3 className="text-sm font-semibold text-ink">Change the rate</h3>
        <p className="mt-1 text-xs text-ink-muted">
          Now {currentPercent}%. The new rate reaches customers attributed from the effective date; people already attributed keep theirs. Needs 30 days&apos; notice unless the partner has agreed in writing. The partner is emailed the notice.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="New rate (%)" htmlFor={`rc-rate-${partnerId}`}>
          <Input id={`rc-rate-${partnerId}`} name="ratePercent" type="number" min={0} max={30} step="0.5" required />
        </Field>
        <Field label="Effective date (optional)" htmlFor={`rc-date-${partnerId}`} hint="Blank = earliest allowed.">
          <Input id={`rc-date-${partnerId}`} name="effectiveDate" type="date" />
        </Field>
        <Field label="Reason (optional)" htmlFor={`rc-reason-${partnerId}`}>
          <Input id={`rc-reason-${partnerId}`} name="reason" maxLength={300} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" name="agreed" className="size-4" /> The partner has agreed to this change in writing (allows an earlier date)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending} className="px-4 py-2 text-xs">
          {pending ? "Scheduling…" : "Schedule and send notice"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function CancelRateChangeForm({ id, partnerId }: { id: string; partnerId: string }) {
  const [state, action, pending] = useActionState(cancelRateChange, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="partnerId" value={partnerId} />
      <Button type="submit" variant="ghost" disabled={pending} className="px-3 py-1.5 text-xs">
        Cancel
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Ends the relationship: 30 days' notice (7 in the pilot), or at once for cause. */
export function TerminateForm({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(terminatePartner, initial);
  return (
    <form action={action} className="card space-y-3 border-rose/30 p-5">
      <input type="hidden" name="id" value={partnerId} />
      <div>
        <h3 className="text-sm font-semibold text-ink">Terminate the agreement</h3>
        <p className="mt-1 text-xs text-ink-muted">
          Without cause: 30 days&apos; notice (7 days in the first 90 days). For cause (established fraud, serious unlawful promotion, security misuse, a legal requirement): at once. From the date, no new accounts are credited; customers who already paid keep earning to the end of their own 12 months; the partner is paid with no minimum. The partner is emailed the notice.
        </p>
      </div>
      <Field label="Reason (sent to the partner)" htmlFor={`t-reason-${partnerId}`}>
        <Input id={`t-reason-${partnerId}`} name="reason" maxLength={300} required />
      </Field>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" name="forCause" className="size-4" /> For cause: takes effect immediately
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={pending} className="px-4 py-2 text-xs">
          {pending ? "Working…" : "Terminate and send notice"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** Forfeits one referral's commission after termination for breach or fraud (clause 11.3). */
export function ForfeitForm({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(forfeitReferral, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="partnerId" value={partnerId} />
      <Input name="email" type="email" placeholder="Referral's account email" aria-label="Account email" className="w-60 py-1.5 text-xs" required />
      <Input name="reason" placeholder="Reason" maxLength={300} aria-label="Reason" className="w-60 py-1.5 text-xs" required />
      <Button type="submit" variant="danger" disabled={pending} className="px-3 py-1.5 text-xs">
        Forfeit commission
      </Button>
      <Result state={state} />
    </form>
  );
}
