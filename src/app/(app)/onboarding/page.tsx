import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { safeNext } from "@/lib/safe-redirect";
import { LEAGUES } from "@/lib/leagues";
import { Container } from "@/components/ui/container";
import { StepProgress } from "@/components/ui/step-progress";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { ONBOARDING_STEPS, TOTAL_STEPS } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Set up your feed",
  robots: { index: false, follow: false },
};

const HEADINGS = [
  { title: "Set up your feed", blurb: "Three quick questions. Under a minute, and you can skip any of them." },
  { title: "Tell us how you read a match", blurb: "So the numbers you care about come first." },
  { title: "Last one", blurb: "Then you're done." },
];

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const params = await searchParams;

  if (!supabaseConfigured) redirect("/");

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const next = safeNext(params.next);

  // Onboarding is post-sign-up by definition; there is nothing to personalise
  // for someone who isn't signed in.
  if (!user) redirect(`/account/login?next=${encodeURIComponent("/onboarding")}`);

  const preferences = await getPreferencesFor(supabase, user.id);

  // Already answered. Sending them round again would look broken, and the
  // account page is where preferences are edited afterwards.
  if (hasOnboarded(preferences)) redirect(next);

  const raw = Number(Array.isArray(params.step) ? params.step[0] : params.step);
  const step = Number.isInteger(raw) && raw >= 1 && raw <= TOTAL_STEPS ? raw : 1;
  const heading = HEADINGS[step - 1];

  return (
    <Container width="narrow" className="py-10 sm:py-16">
      <StepProgress steps={[...ONBOARDING_STEPS]} current={step} />

      <div className="card mt-8 p-5 sm:p-7">
        <h1 className="font-display text-2xl font-bold">{heading.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{heading.blurb}</p>

        <OnboardingForm
          step={step}
          next={next}
          leagues={LEAGUES}
          preferences={preferences}
        />
      </div>
    </Container>
  );
}
