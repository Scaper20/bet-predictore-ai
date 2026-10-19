"use client";

import { useActionState } from "react";
import {
  createPartner,
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
        <Field label="Commission rate (%)" htmlFor={`p-rate-${key}`} hint="Applies to payments from now on. Earned commissions keep their rate.">
          <Input id={`p-rate-${key}`} name="ratePercent" type="number" min={0} max={50} step="0.5" defaultValue={partner?.ratePercent ?? "20"} required />
        </Field>
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
