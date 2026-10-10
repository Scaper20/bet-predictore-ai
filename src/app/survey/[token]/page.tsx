import type { Metadata } from "next";
import { resolveSurveyByToken } from "@/lib/outreach-feed";
import { SURVEY_QUESTIONS } from "@/lib/outreach";
import { SurveyForm } from "@/components/survey/survey-form";
import { LogoLockup } from "@/components/brand/logo";

export const metadata: Metadata = { title: "A quick survey", robots: { index: false, follow: false } };

export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await resolveSurveyByToken(token);

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-16 sm:px-6">
      <div className="mb-8 text-center">
        <LogoLockup className="mx-auto h-7 w-auto text-ink" />
        <span className="sr-only">KiqStat</span>
      </div>

      {!response ? (
        <div className="card p-6 text-center sm:p-8">
          <h1 className="font-display text-lg font-bold text-ink">This link isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-ink-muted">It may have expired, or been mistyped. Sorry about that.</p>
        </div>
      ) : response.submittedAt ? (
        <div className="card p-6 text-center sm:p-8">
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-brand/25 bg-brand/12 text-2xl">✓</div>
          <h1 className="font-display mt-4 text-lg font-bold text-ink">Already recorded — thank you</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            You answered this one already. If you want to add anything else, just reply to the email.
          </p>
        </div>
      ) : (
        <>
          <h1 className="font-display mb-1 text-xl font-bold text-ink">A quick one from Scaper</h1>
          <p className="mb-7 text-sm leading-relaxed text-ink-muted">
            {SURVEY_QUESTIONS[response.survey].length} questions, about 2–3 minutes. No account needed — this goes
            straight to me.
          </p>
          <SurveyForm token={token} survey={response.survey} questions={SURVEY_QUESTIONS[response.survey]} />
        </>
      )}
    </div>
  );
}
