"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import { ChoiceCard, ChoiceChip, ChoiceGroup } from "@/components/ui/choice";
import { saveOnboardingStep, type OnboardingActionState } from "@/app/actions/onboarding";
import { TOTAL_STEPS } from "@/lib/onboarding";
import type { LeagueDef } from "@/lib/leagues";
import type { UserPreferences } from "@/lib/preferences";

const initialState: OnboardingActionState = { error: null };

/**
 * One step of the questionnaire.
 *
 * The step lives in the URL rather than in client state, so Back works, a
 * half-finished flow survives a refresh, and someone who wanders off can be
 * dropped straight back where they were. Each step is its own form post, so
 * the whole thing degrades to plain HTML if the JS never arrives — which
 * matters more than usual here, on mobile connections, at the exact moment we
 * are asking someone for something.
 */
export function OnboardingForm({
  step,
  next,
  leagues,
  preferences,
}: {
  step: number;
  next: string;
  leagues: LeagueDef[];
  preferences: UserPreferences;
}) {
  const [state, formAction, pending] = useActionState(saveOnboardingStep, initialState);
  const last = step === TOTAL_STEPS;

  return (
    <form action={formAction} className="mt-8">
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="next" value={next} />

      {step === 1 && (
        <ChoiceGroup
          legend="Which competitions do you follow?"
          hint="We'll lead with these on your feed and put them first in fixtures and predictions. You can change this any time."
        >
          {leagues.map((l) => (
            <ChoiceChip
              key={l.code}
              name="leagues"
              value={l.code}
              icon={l.flag}
              label={l.shortName}
              defaultChecked={preferences.leagues.includes(l.code)}
            />
          ))}
        </ChoiceGroup>
      )}

      {step === 2 && (
        <ChoiceGroup
          legend="What do you use predictions for?"
          hint="This decides which numbers we put in front of you first."
          layout="stack"
        >
          <ChoiceCard
            name="usageIntent"
            value="team"
            label="Following my team"
            description="Form, head-to-head and what the numbers say about the next match."
            defaultChecked={preferences.usageIntent === "team"}
          />
          <ChoiceCard
            name="usageIntent"
            value="value"
            label="Finding value"
            description="Whether the price you're offered beats the one the pick needs."
            defaultChecked={preferences.usageIntent === "value"}
          />
          <ChoiceCard
            name="usageIntent"
            value="accas"
            label="Building accumulators"
            description="True combined probability across several legs, not the bookmaker's version."
            defaultChecked={preferences.usageIntent === "accas"}
          />
        </ChoiceGroup>
      )}

      {step === 3 && (
        <ChoiceGroup
          legend="Want a heads-up before matchday?"
          hint="Only what you ask for, and you can turn it off from your account in one click."
          layout="stack"
        >
          <ChoiceCard
            name="digest"
            value="weekend"
            label="Weekends only"
            description="One email on Friday with the weekend slate."
            defaultChecked={preferences.digest === "weekend"}
          />
          <ChoiceCard
            name="digest"
            value="matchday"
            label="Every matchday"
            description="A short digest whenever your leagues are playing."
            defaultChecked={preferences.digest === "matchday"}
          />
          <ChoiceCard
            name="digest"
            value="none"
            label="No emails"
            description="Nothing but account and billing messages."
            defaultChecked={preferences.digest === "none"}
          />
        </ChoiceGroup>
      )}

      {state.error && (
        <p className="mt-4 text-sm text-rose" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex items-center gap-3">
        {step > 1 && (
          <Link
            href={`/onboarding?step=${step - 1}&next=${encodeURIComponent(next)}`}
            className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            ← Back
          </Link>
        )}
        <Button type="submit" className="ml-auto" disabled={pending}>
          {pending ? "Saving…" : last ? "Finish" : "Continue →"}
        </Button>
      </div>

      {/*
        A second submit button rather than a link, so skipping still records
        that the step was reached — that is the only drop-off signal this
        product has.
      */}
      <div className="mt-4 text-center">
        <button
          type="submit"
          name="intent"
          value="skip"
          disabled={pending}
          className="text-xs text-ink-dim underline underline-offset-2 hover:text-ink-muted disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
    </form>
  );
}
