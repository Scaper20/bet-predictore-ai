import type { BillingCycle } from "@/lib/pricing";

/**
 * Where a payer is, and so how they pay.
 *
 * Nigeria pays through Paystack in naira on recurring card subscriptions
 * (the plans in lib/pricing.ts). Everywhere else pays through Flutterwave, in
 * the local currency, with the local methods: Mobile Money in Ghana, Uganda,
 * Rwanda, Tanzania, Zambia and francophone Africa, M-Pesa in Kenya, cards
 * everywhere. Mobile money can't be auto-debited, so a Flutterwave payment
 * buys a prepaid period rather than a subscription (lib/flutterwave/period.ts).
 *
 * PRICES ARE LAUNCH PRICES. Pro sits near US$4 a month and VIP near US$9,
 * with the Nigerian 10% / 20% discounts for 3 months / a year, rounded to
 * figures that read naturally in each currency. Change them here; nothing
 * else holds a price.
 */

export type Provider = "paystack" | "flutterwave";

export interface Market {
  /** ISO 3166 alpha-2, or "XX" for everywhere not listed. */
  country: string;
  label: string;
  flag: string;
  currency: string;
  provider: Provider;
  /** Flutterwave `payment_options`; methods not valid for the currency are hidden by Flutterwave. */
  methods?: string;
  /** How people here pay, in their words. */
  methodsLabel: string;
  /** Major units of `currency`, per plan and cycle. Paystack markets read lib/pricing.ts instead. */
  prices?: Record<"pro" | "vip", Record<BillingCycle, number>>;
}

const tiered = (pro: [number, number, number], vip: [number, number, number]) => ({
  pro: { monthly: pro[0], quarterly: pro[1], yearly: pro[2] },
  vip: { monthly: vip[0], quarterly: vip[1], yearly: vip[2] },
});

export const NIGERIA: Market = {
  country: "NG",
  label: "Nigeria",
  flag: "🇳🇬",
  currency: "NGN",
  provider: "paystack",
  methodsLabel: "Card, bank transfer or USSD",
};

export const ELSEWHERE: Market = {
  country: "XX",
  label: "Other countries",
  flag: "🌍",
  currency: "USD",
  provider: "flutterwave",
  methods: "card",
  methodsLabel: "Card",
  prices: tiered([4, 11, 38], [9, 24, 86]),
};

export const MARKETS: Market[] = [
  NIGERIA,
  {
    country: "GH", label: "Ghana", flag: "🇬🇭", currency: "GHS", provider: "flutterwave",
    methods: "card,mobilemoneyghana", methodsLabel: "Mobile Money (MTN, Telecel, AT) or card",
    prices: tiered([50, 135, 480], [120, 324, 1150]),
  },
  {
    country: "KE", label: "Kenya", flag: "🇰🇪", currency: "KES", provider: "flutterwave",
    methods: "card,mpesa", methodsLabel: "M-Pesa or card",
    prices: tiered([500, 1350, 4800], [1200, 3240, 11500]),
  },
  {
    country: "UG", label: "Uganda", flag: "🇺🇬", currency: "UGX", provider: "flutterwave",
    methods: "card,mobilemoneyuganda", methodsLabel: "Mobile Money (MTN, Airtel) or card",
    prices: tiered([15000, 40500, 144000], [35000, 94500, 336000]),
  },
  {
    country: "TZ", label: "Tanzania", flag: "🇹🇿", currency: "TZS", provider: "flutterwave",
    methods: "card,mobilemoneytanzania", methodsLabel: "Mobile Money or card",
    prices: tiered([10000, 27000, 96000], [24000, 64800, 230000]),
  },
  {
    country: "RW", label: "Rwanda", flag: "🇷🇼", currency: "RWF", provider: "flutterwave",
    methods: "card,mobilemoneyrwanda", methodsLabel: "Mobile Money (MTN, Airtel) or card",
    prices: tiered([5500, 14850, 52800], [13000, 35100, 124800]),
  },
  {
    country: "ZM", label: "Zambia", flag: "🇿🇲", currency: "ZMW", provider: "flutterwave",
    methods: "card,mobilemoneyzambia", methodsLabel: "Mobile Money or card",
    prices: tiered([100, 270, 960], [240, 648, 2300]),
  },
  {
    country: "CM", label: "Cameroon", flag: "🇨🇲", currency: "XAF", provider: "flutterwave",
    methods: "card,mobilemoneyxaf,mobilemoneyfranco", methodsLabel: "Mobile Money (MTN, Orange) or card",
    prices: tiered([2500, 6750, 24000], [5500, 14850, 52800]),
  },
  {
    country: "CI", label: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", provider: "flutterwave",
    methods: "card,mobilemoneyxof,mobilemoneyfranco", methodsLabel: "Mobile Money (Orange, MTN, Moov) or card",
    prices: tiered([2500, 6750, 24000], [5500, 14850, 52800]),
  },
  {
    country: "SN", label: "Senegal", flag: "🇸🇳", currency: "XOF", provider: "flutterwave",
    methods: "card,mobilemoneyxof,mobilemoneyfranco", methodsLabel: "Mobile Money (Orange, Free) or card",
    prices: tiered([2500, 6750, 24000], [5500, 14850, 52800]),
  },
  {
    country: "ZA", label: "South Africa", flag: "🇿🇦", currency: "ZAR", provider: "flutterwave",
    methods: "card,account", methodsLabel: "Card or bank account",
    prices: tiered([70, 189, 672], [160, 432, 1536]),
  },
  ELSEWHERE,
];

/** The market for a country code (from the visitor's IP or their choice); unknown means "elsewhere". */
export function marketFor(country: string | null | undefined): Market {
  const code = (country ?? "").trim().toUpperCase();
  return MARKETS.find((m) => m.country === code) ?? ELSEWHERE;
}

/** The Flutterwave price of a plan in a market, or undefined where it isn't sold that way. */
export function marketPrice(market: Market, tier: "pro" | "vip", cycle: BillingCycle): number | undefined {
  return market.prices?.[tier][cycle];
}

/**
 * What a payments row was for, in the currency it was paid in. Paystack rows
 * hold kobo in amount_kobo; Flutterwave rows hold minor units of their own
 * currency in amount_minor (supabase/migrations/0050_flutterwave.sql).
 */
export function paymentAmount(row: { amount_kobo: number; currency?: string | null; amount_minor?: number | null }): string {
  if (row.currency && row.currency !== "NGN" && row.amount_minor != null) {
    return formatMoney(Number(row.amount_minor) / 100, row.currency);
  }
  return formatMoney(row.amount_kobo / 100, "NGN");
}

/** "GH₵50", "KSh 500", "$4" — the way each currency is usually written. */
export function formatMoney(amount: number, currency: string): string {
  if (currency === "NGN") return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en")}`;
  }
}
