import { CYCLE_LABEL, type BillingCycle, type PlanDefinition } from "@/lib/pricing";

/**
 * Structured data for the pricing page (CTO checklist 4.6): the plans and their
 * naira prices as schema.org offers, so an answer engine asked "how much is
 * KiqStat Pro" can quote the price from markup and not infer it from the page.
 * Naira only: the page's other markets are shown to visitors by country and are
 * not something a crawler should treat as the price. Built from the same plan
 * definitions (with admin overrides) the page renders.
 */
export function pricingJsonLd(plans: PlanDefinition[], siteUrl: string, pageUrl: string) {
  const offers = plans.flatMap((p) =>
    (Object.entries(p.price) as [BillingCycle, number | undefined][])
      .filter(([, naira]) => typeof naira === "number" && naira > 0)
      .map(([cycle, naira]) => ({
        "@type": "Offer",
        name: `${p.name}, ${CYCLE_LABEL[cycle].name.toLowerCase()}`,
        price: String(naira),
        priceCurrency: "NGN",
        url: pageUrl,
        availability: "https://schema.org/InStock",
        description: `${p.description} Billed ${CYCLE_LABEL[cycle].per}.`,
      })),
  );
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "KiqStat football predictions",
    description: "Football predictions from a statistical model, with a free plan and paid Pro and VIP plans.",
    brand: { "@type": "Brand", name: "KiqStat" },
    url: pageUrl,
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "NGN", url: pageUrl, availability: "https://schema.org/InStock" },
      ...offers,
    ],
    isRelatedTo: { "@id": `${siteUrl}/#organization` },
  };
}
