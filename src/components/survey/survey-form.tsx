"use client";

import { useActionState } from "react";
import { submitSurvey, type SurveyActionState } from "@/app/actions/survey";
import { ChoiceChip, ChoiceGroup } from "@/components/ui/choice";
import { Button } from "@/components/ui/primitives";
import type { SurveyQuestion, SurveyType } from "@/lib/outreach";

const initialState: SurveyActionState = { error: null, submitted: false };

const NPS_VALUES = Array.from({ length: 11 }, (_, i) => String(i));

export function SurveyForm({
  token,
  survey,
  questions,
}: {
  token: string;
  survey: SurveyType;
  questions: SurveyQuestion[];
}) {
  const [state, formAction, pending] = useActionState(submitSurvey, initialState);

  if (state.submitted) {
    return (
      <div className="card p-6 text-center sm:p-8">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-brand/25 bg-brand/12 text-2xl">✓</div>
        <h2 className="font-display mt-4 text-lg font-bold text-ink">Thanks — got it.</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          I read every one of these myself. Really appreciate you taking the time.
          <br />— Scaper
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="survey" value={survey} />

      {questions.map((q) => (
        <ChoiceGroup key={q.id} legend={q.prompt} layout={q.type === "text" ? "stack" : "wrap"}>
          {q.type === "text" && (
            <textarea
              name={q.id}
              rows={2}
              placeholder={q.placeholder}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
            />
          )}
          {(q.type === "choice" || q.type === "scale") &&
            q.options?.map((opt) => <ChoiceChip key={opt.value} name={q.id} value={opt.value} type="radio" label={opt.label} />)}
          {q.type === "nps" &&
            NPS_VALUES.map((n) => <ChoiceChip key={n} name={q.id} value={n} type="radio" label={n} />)}
        </ChoiceGroup>
      ))}

      {state.error && <p className="text-sm text-rose">{state.error}</p>}

      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Submit"}
      </Button>
    </form>
  );
}
