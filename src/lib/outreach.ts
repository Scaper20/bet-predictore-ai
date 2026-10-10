import type { Tier } from "@/lib/entitlements";

export type CampaignType = "warm_checkin" | "survey_subscribed" | "survey_free" | "announce_whatsapp" | "announce_rebrand";
export type SurveyType = Extract<CampaignType, "survey_subscribed" | "survey_free">;

/**
 * Which survey a user's current tier puts them in — a lighter-weight call
 * than entitlements.ts's grace-period-aware resolution, and deliberately
 * so: this decides which of two surveys to email, not whether to grant
 * access, so "just lapsed yesterday" landing in the free-user bucket a day
 * early is a fine approximation, not a correctness bug.
 */
export function classifySegment(sub: { tier: string; status: string } | null): "subscribed" | "free" {
  if (!sub) return "free";
  const paidTier = sub.tier === "pass" || sub.tier === "pro" || sub.tier === "vip";
  const liveStatus = sub.status === "active" || sub.status === "past_due";
  return paidTier && liveStatus ? "subscribed" : "free";
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  type: "scale" | "nps" | "choice" | "text";
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

const USE_CASE_OPTIONS = [
  { value: "team", label: "Following my team" },
  { value: "value", label: "Finding value bets" },
  { value: "accas", label: "Building accumulators" },
  { value: "live", label: "Live scores & live odds" },
];

/** ~6 questions, mostly single-tap — aimed at under 3 minutes end to end. */
export const SURVEY_QUESTIONS: Record<SurveyType, SurveyQuestion[]> = {
  survey_subscribed: [
    {
      id: "satisfaction",
      prompt: "Overall, how satisfied are you with KiqStat so far?",
      type: "scale",
      required: true,
      options: [
        { value: "1", label: "Not satisfied" },
        { value: "2", label: "Could be better" },
        { value: "3", label: "It's fine" },
        { value: "4", label: "Good" },
        { value: "5", label: "Love it" },
      ],
    },
    {
      id: "nps",
      prompt: "How likely are you to recommend KiqStat to a friend? (0 = not at all, 10 = definitely)",
      type: "nps",
      required: true,
    },
    {
      id: "use_case",
      prompt: "What do you use KiqStat for most?",
      type: "choice",
      required: true,
      options: USE_CASE_OPTIONS,
    },
    {
      id: "other_services",
      prompt: "Do you also use another prediction site or tipster alongside KiqStat? If so, which?",
      type: "text",
      required: false,
      placeholder: "e.g. none, or the name of the other service",
    },
    {
      id: "improvement",
      prompt: "What's the one thing that would make your subscription more worth it?",
      type: "text",
      required: false,
      placeholder: "More leagues, better accas, clearer stats…",
    },
    {
      id: "anything_else",
      prompt: "Anything else you'd like Scaper to know?",
      type: "text",
      required: false,
    },
  ],
  survey_free: [
    {
      id: "blocker",
      prompt: "What's the main reason you haven't subscribed yet?",
      type: "choice",
      required: true,
      options: [
        { value: "price", label: "Price" },
        { value: "unproven", label: "Not sure it's worth it yet" },
        { value: "free_enough", label: "The free picks are enough for me" },
        { value: "low_frequency", label: "I don't bet often enough to need more" },
        { value: "other", label: "Something else" },
      ],
    },
    {
      id: "convince",
      prompt: "What would most convince you to subscribe?",
      type: "choice",
      required: true,
      options: [
        { value: "price", label: "A lower price" },
        { value: "proof", label: "More proof it actually works" },
        { value: "trial", label: "A free trial" },
        { value: "features", label: "More leagues or features" },
        { value: "nothing", label: "Nothing — I'm happy on the free plan" },
      ],
    },
    {
      id: "nps",
      prompt: "How likely are you to recommend KiqStat to a friend, even on the free plan? (0 = not at all, 10 = definitely)",
      type: "nps",
      required: true,
    },
    {
      id: "use_case",
      prompt: "What do you use KiqStat for most?",
      type: "choice",
      required: true,
      options: USE_CASE_OPTIONS,
    },
    {
      id: "improvement",
      prompt: "What's one thing KiqStat could do better?",
      type: "text",
      required: false,
    },
    {
      id: "anything_else",
      prompt: "Anything else you'd like Scaper to know?",
      type: "text",
      required: false,
    },
  ],
};

export const TIER_LABEL: Record<Tier, string> = { free: "Free", pass: "Pass", pro: "Pro", vip: "VIP" };

/** Raw stored answers are option *values* ("price", "4"), not the label
 * shown on the button — this turns one back into the other for display.
 * Falls back to the raw value for text/nps questions (nothing to look up)
 * and for a value that no longer matches any current option (the question
 * set changed since this was answered — show what was actually stored
 * rather than hiding it). */
export function answerLabel(question: SurveyQuestion, rawValue: string): string {
  return question.options?.find((o) => o.value === rawValue)?.label ?? rawValue;
}

/** Average of a numeric-scale/NPS question across a set of answer maps,
 * ignoring rows that skipped it (never happens for a required question,
 * but this stays correct if that ever changes). Null with no answers at
 * all, rather than a misleading 0. */
export function averageAnswer(rows: { answers: Record<string, string> }[], questionId: string): number | null {
  const values = rows
    .map((r) => r.answers[questionId])
    .filter((v): v is string => v !== undefined)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}
