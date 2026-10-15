/**
 * Risk labels for a pick, from the model's own track record rather than a
 * round-number guess.
 *
 * Graded picks in predictions_log up to 15 Oct 2026 (690 settled):
 *
 *   model probability   picks   landed
 *   65% and up            543     71%
 *   55% to 65%            131     63%
 *   below 55%              16     50%
 *
 * The cut is at 65, not 70: picks from 60 up already landed about 7 in 10,
 * while 55-60 dropped to 55%. Above 80% the model is overconfident (those
 * landed 67%), which is why the label promises "about 7 in 10" and not the
 * headline number. Re-check the table as the record grows.
 */
export type RiskLevel = "low" | "medium" | "high";

export const LOW_RISK_FROM = 0.65;
export const MEDIUM_RISK_FROM = 0.55;

export function riskFor(probability: number): RiskLevel {
  if (probability >= LOW_RISK_FROM) return "low";
  if (probability >= MEDIUM_RISK_FROM) return "medium";
  return "high";
}

export const RISK: Record<RiskLevel, { label: string; record: string }> = {
  low: { label: "Low risk", record: "Picks like this have landed about 7 in 10 times." },
  medium: { label: "Medium risk", record: "Picks like this have landed about 6 in 10 times." },
  high: { label: "High risk", record: "Picks like this have landed about half the time." },
};
