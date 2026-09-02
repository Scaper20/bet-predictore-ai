"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/primitives";
import { ChoiceCard, ChoiceChip, ChoiceGroup } from "@/components/ui/choice";
import { updatePreferences, type AccountActionState } from "@/app/actions/account";
import type { LeagueDef } from "@/lib/leagues";
import type { UserPreferences } from "@/lib/preferences";

const initialState: AccountActionState = { error: null, message: null };

/**
 * The onboarding answers, editable.
 *
 * Same controls as the wizard, because they are the same questions — a user
 * who skipped them at sign-up should be able to answer here and get an
 * identical result, and one who answered should recognise what they picked.
 */
export function PreferencesForm({
  leagues,
  preferences,
}: {
  leagues: LeagueDef[];
  preferences: UserPreferences;
}) {
  const [state, formAction, pending] = useActionState(updatePreferences, initialState);

  return (
    <form action={formAction} className="space-y-8">
      <ChoiceGroup
        legend="Competitions you follow"
        hint="These lead your feed and come first in fixtures and predictions."
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

      <ChoiceGroup legend="What you use predictions for" layout="stack">
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
          description="Fair odds against the price you're offered, margin stripped out."
          defaultChecked={preferences.usageIntent === "value"}
        />
        <ChoiceCard
          name="usageIntent"
          value="accas"
          label="Building accumulators"
          description="True combined probability across several legs."
          defaultChecked={preferences.usageIntent === "accas"}
        />
      </ChoiceGroup>

      <ChoiceGroup legend="Matchday emails" layout="stack">
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

      {state.error && <p className="text-sm text-rose">{state.error}</p>}
      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
