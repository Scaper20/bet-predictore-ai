"use server";

import { submitSurveyResponse } from "@/lib/outreach-feed";
import { SURVEY_QUESTIONS, type SurveyType } from "@/lib/outreach";

export type SurveyActionState = { error: string | null; submitted: boolean };

function isSurveyType(v: FormDataEntryValue | null): v is SurveyType {
  return v === "survey_subscribed" || v === "survey_free";
}

/** Public — reached by token from an email link, no session involved. */
export async function submitSurvey(_prev: SurveyActionState, formData: FormData): Promise<SurveyActionState> {
  const token = String(formData.get("token") ?? "");
  const survey = formData.get("survey");
  if (!token) return { error: "Missing survey link.", submitted: false };
  if (!isSurveyType(survey)) return { error: "Invalid survey.", submitted: false };

  const answers: Record<string, string> = {};
  for (const q of SURVEY_QUESTIONS[survey]) {
    const value = String(formData.get(q.id) ?? "").trim();
    if (q.required && !value) return { error: `Please answer: ${q.prompt}`, submitted: false };
    if (value) answers[q.id] = value;
  }

  const { error } = await submitSurveyResponse(token, answers);
  if (error) return { error, submitted: false };
  return { error: null, submitted: true };
}
