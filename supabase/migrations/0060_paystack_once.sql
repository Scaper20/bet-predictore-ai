-- Pay once through Paystack (src/lib/paystack/once.ts).
--
-- A Paystack checkout that carries a plan is a subscription, and Paystack
-- only renews those from a card, so its checkout hides OPay, PalmPay, USSD
-- and pay-with-bank. A one-off Pro or VIP period has no plan, so every
-- method shows. It is a prepaid period like a Flutterwave one: nothing
-- renews and nothing needs cancelling.
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider is null or provider in ('paystack', 'flutterwave', 'paystack_once'));

comment on column public.subscriptions.provider is
  'null or paystack: a Paystack subscription. flutterwave or paystack_once: a prepaid period that ends at current_period_end.';
