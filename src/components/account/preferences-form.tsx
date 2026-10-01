"use client";

import { useActionState } from "react";
import { Button, ExternalButtonLink } from "@/components/ui/primitives";
import { ChoiceCard, ChoiceChip, ChoiceGroup } from "@/components/ui/choice";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { updatePreferences, type AccountActionState } from "@/app/actions/account";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/whatsapp-community";
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
  valueAlertsEmail = null,
}: {
  leagues: LeagueDef[];
  preferences: UserPreferences;
  /** VIP members only; null hides the control. */
  valueAlertsEmail?: boolean | null;
}) {
  const [state, formAction, pending] = useActionState(updatePreferences, initialState);

  return (
    <div className="space-y-8">
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
            description="Whether the price you're offered beats the one the pick needs."
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

        {valueAlertsEmail !== null && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">VIP value-shift alerts</legend>
            <input type="hidden" name="valueAlertsField" value="1" />
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
              <input
                type="checkbox"
                name="valueAlertsEmail"
                defaultChecked={valueAlertsEmail}
                className="mt-0.5 size-4 accent-[var(--color-brand)]"
              />
              <span>
                <span className="font-medium">Email me new value prices each morning</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  The alerts page keeps working either way.
                </span>
              </span>
            </label>
          </fieldset>
        )}

        {state.error && <p className="text-sm text-rose">{state.error}</p>}
        {state.message && <p className="text-sm text-brand">{state.message}</p>}

        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </form>

      <WhatsAppCommunitySection />
    </div>
  );
}

/**
 * Deliberately outside the <form> above — this isn't a preference to save,
 * it's a link out to WhatsApp, so there's nothing here for
 * updatePreferences to receive. Renders nothing until
 * NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL is set.
 */
function WhatsAppCommunitySection() {
  if (!WHATSAPP_COMMUNITY_URL) return null;

  return (
    <div className="border-t border-line pt-8">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">WhatsApp picks</span>
        <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-ink">
          New
        </span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-ink-muted">
        Separate from matchday emails above. This isn&rsquo;t a personal subscription — it&rsquo;s
        one community broadcast, so there&rsquo;s nothing to save here beyond joining.
      </p>

      <ExternalButtonLink href={WHATSAPP_COMMUNITY_URL} variant="primary" className="w-full gap-2 sm:w-auto">
        <WhatsAppIcon className="size-[18px]" />
        Join the WhatsApp community
      </ExternalButtonLink>

      <p className="mt-3 text-xs leading-relaxed text-ink-dim">
        Opens WhatsApp to join. We can&rsquo;t see who&rsquo;s in the group from here — leave
        anytime from the group&rsquo;s own info screen.
      </p>
    </div>
  );
}
