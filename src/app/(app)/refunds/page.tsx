import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  alternates: { canonical: "/refunds" },
  title: "Refund Policy",
  description:
    "When you can get your money back on KiqStat: 7 days on a first payment, 48 hours on a renewal, passes if they didn't unlock, " +
    "and how to ask.",
};

const RULES = [
  {
    title: "First payment: 7 days",
    body: "If you pay for a plan for the first time and it is not for you, ask within 7 days of paying and you get that payment back in full. This also covers a plan paid once for a fixed period. Passes have their own rule below.",
  },
  {
    title: "Renewals: 48 hours",
    body: "If a plan renews and you did not mean it to, ask within 48 hours of the charge and you get that renewal back in full.",
  },
  {
    title: "Passes",
    body: "A pass starts the moment you pay and runs for its hours, so a pass that unlocked isn't refunded. If it didn't unlock, or you were charged twice, tell us and we refund it in full.",
  },
  {
    title: "After that: no refund",
    body: "Once those windows pass, the payment is not refundable. You keep access for the time you paid for, and cancelling stops the next renewal.",
  },
];

const STEPS = [
  "Open the chat button on any page and sign in.",
  "Send the email on your account and the payment reference from Plan & billing (or your payment receipt).",
  "We reply within one working day. If you qualify, the refund goes to the card or account you paid with.",
];

export default function RefundsPage() {
  return (
    <>
      <PageHeader eyebrow="Billing" title="Refund policy" description="Plain rules, so you know where you stand before you pay." />

      <article className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="grid gap-4 sm:grid-cols-2">
          {RULES.map((r) => (
            <div key={r.title} className="card p-5">
              <h2 className="font-display text-base font-bold">{r.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{r.body}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="font-display text-xl font-bold sm:text-2xl">How to ask</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-muted">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Refunds go back to the original payment method. Your bank or card issuer decides how
            long it takes to show up, usually a few working days.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold sm:text-2xl">Cancelling</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
            <p>
              You can cancel any time from <Link href="/account/billing" className="text-brand underline underline-offset-2">Plan &amp; billing</Link>.
              Cancelling stops the next renewal and keeps your access until the period you paid
              for ends. It does not refund the current period; that is what the windows above are for.
            </p>
            <p>
              If a payment was taken twice, or taken and your plan did not unlock, tell us at any time
              and we will put it right or refund it.
            </p>
            <p>
              Nothing here limits any right you have under the law where you live.
            </p>
          </div>
        </section>
      </article>
    </>
  );
}
