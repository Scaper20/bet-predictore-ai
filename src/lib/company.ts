/**
 * The legal entity behind KiqStat, in one place, so the footer, the About page
 * and the structured data search engines read can never disagree.
 */
export const COMPANY = {
  brand: "KiqStat",
  /** What the product was called before (October 2026), for search engines and the About page. */
  formerNames: ["BetriX", "Betrix"],
  legalName: "Betrix Data Technologies Ltd",
  country: "Nigeria",
  nationality: "Nigerian",
  countryCode: "NG",
  supportEmail: "support@kiqstat.app",
} as const;
