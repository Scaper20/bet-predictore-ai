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
 * PRICES are a ladder, cheapest in Nigeria and dearest in US dollars:
 *   Nigeria (lib/pricing.ts)      Pro ₦5,000  ≈ US$3.75, VIP ₦12,000 ≈ US$9
 *   the African markets below     about 60% of the dollar price: Pro ≈ US$12, VIP ≈ US$33
 *   South Africa                  about 70%: Pro ≈ US$14, VIP ≈ US$39
 *   US dollars, everywhere else   the highest: Pro US$20, VIP US$55
 * with Nigeria's 10% / 20% discounts for 3 months / a year, rounded to
 * figures that read naturally in each currency. Change them here; nothing
 * else holds a price. markets.test.ts checks the ladder against
 * REFERENCE_RATES, so a price that slips below Nigeria's or above the
 * dollar price fails the build.
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

/**
 * Units of each currency per US dollar, October 2026 (NGN from the CBN's
 * NFEM close; the rest from central bank and Reuters figures). Only for
 * keeping the price ladder in order in markets.test.ts: nothing is charged
 * or converted with these. Refresh them when re-pricing.
 */
export const REFERENCE_RATES: Record<string, number> = {
  NGN: 1333, USD: 1, GHS: 11, KES: 129.5, UGX: 3650, TZS: 2640, RWF: 1450, ZMW: 17.5, XAF: 565, XOF: 565, ZAR: 16.3,
};

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
  prices: tiered([20, 54, 192], [55, 149, 528]),
};

export const MARKETS: Market[] = [
  NIGERIA,
  {
    country: "GH", label: "Ghana", flag: "🇬🇭", currency: "GHS", provider: "flutterwave",
    methods: "card,mobilemoneyghana", methodsLabel: "Mobile Money (MTN, Telecel, AT) or card",
    prices: tiered([130, 350, 1250], [360, 970, 3450]),
  },
  {
    country: "KE", label: "Kenya", flag: "🇰🇪", currency: "KES", provider: "flutterwave",
    methods: "card,mpesa", methodsLabel: "M-Pesa or card",
    prices: tiered([1550, 4200, 14900], [4300, 11600, 41300]),
  },
  {
    country: "UG", label: "Uganda", flag: "🇺🇬", currency: "UGX", provider: "flutterwave",
    methods: "card,mobilemoneyuganda", methodsLabel: "Mobile Money (MTN, Airtel) or card",
    prices: tiered([44000, 119000, 422000], [120000, 324000, 1152000]),
  },
  {
    country: "TZ", label: "Tanzania", flag: "🇹🇿", currency: "TZS", provider: "flutterwave",
    methods: "card,mobilemoneytanzania", methodsLabel: "Mobile Money or card",
    prices: tiered([32000, 86400, 307000], [87000, 235000, 835000]),
  },
  {
    country: "RW", label: "Rwanda", flag: "🇷🇼", currency: "RWF", provider: "flutterwave",
    methods: "card,mobilemoneyrwanda", methodsLabel: "Mobile Money (MTN, Airtel) or card",
    prices: tiered([17500, 47250, 168000], [48000, 129600, 461000]),
  },
  {
    country: "ZM", label: "Zambia", flag: "🇿🇲", currency: "ZMW", provider: "flutterwave",
    methods: "card,mobilemoneyzambia", methodsLabel: "Mobile Money or card",
    prices: tiered([210, 565, 2020], [580, 1565, 5570]),
  },
  {
    country: "CM", label: "Cameroon", flag: "🇨🇲", currency: "XAF", provider: "flutterwave",
    methods: "card,mobilemoneyxaf,mobilemoneyfranco", methodsLabel: "Mobile Money (MTN, Orange) or card",
    prices: tiered([7000, 18900, 67200], [18500, 50000, 177600]),
  },
  {
    country: "CI", label: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", provider: "flutterwave",
    methods: "card,mobilemoneyxof,mobilemoneyfranco", methodsLabel: "Mobile Money (Orange, MTN, Moov) or card",
    prices: tiered([7000, 18900, 67200], [18500, 50000, 177600]),
  },
  {
    country: "SN", label: "Senegal", flag: "🇸🇳", currency: "XOF", provider: "flutterwave",
    methods: "card,mobilemoneyxof,mobilemoneyfranco", methodsLabel: "Mobile Money (Orange, Free) or card",
    prices: tiered([7000, 18900, 67200], [18500, 50000, 177600]),
  },
  {
    country: "ZA", label: "South Africa", flag: "🇿🇦", currency: "ZAR", provider: "flutterwave",
    methods: "card,account", methodsLabel: "Card or bank account",
    prices: tiered([230, 620, 2210], [635, 1715, 6100]),
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
