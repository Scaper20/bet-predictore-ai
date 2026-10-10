-- 0050: Flutterwave alongside Paystack.
--
-- Paystack keeps Nigeria (naira, recurring card subscriptions). Flutterwave
-- takes payers elsewhere in Africa and the world, in their own currency and
-- with their own methods (Mobile Money, M-Pesa, cards). Mobile money cannot
-- be auto-debited, so a Flutterwave payment buys a prepaid period: access
-- until current_period_end, extended by each further payment, nothing to
-- cancel.
--
-- Additive only: existing rows read as Paystack, in naira, exactly as before.

alter table public.payments
  add column if not exists provider text not null default 'paystack',
  add column if not exists currency text not null default 'NGN',
  -- Hundredths of the payment's currency unit, whatever the currency.
  add column if not exists amount_minor bigint;

alter table public.payments
  drop constraint if exists payments_provider_check;
alter table public.payments
  add constraint payments_provider_check check (provider in ('paystack', 'flutterwave'));

comment on column public.payments.paystack_reference is
  'The payment''s reference at its provider: the Paystack reference, or the Flutterwave tx_ref. Named before Flutterwave existed here.';
comment on column public.payments.amount_kobo is
  'Naira amount in kobo, the revenue figures'' unit. 0 for a payment in another currency (see currency, amount_minor).';

alter table public.subscriptions
  add column if not exists provider text;

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider is null or provider in ('paystack', 'flutterwave'));

comment on column public.subscriptions.provider is
  'Who took the latest payment. null on rows written before Flutterwave: those are Paystack. flutterwave = a prepaid period, no recurring subscription.';
