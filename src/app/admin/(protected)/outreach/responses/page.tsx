import type { Metadata } from "next";
import { getSurveyResponses } from "@/lib/admin-analytics";
import { SURVEY_QUESTIONS, TIER_LABEL, answerLabel, averageAnswer, type SurveyType } from "@/lib/outreach";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { StatCard } from "@/components/admin/stat-card";
import type { Tier } from "@/lib/entitlements";

export const metadata: Metadata = { title: "Survey responses" };

const TABS: { type: SurveyType; label: string }[] = [
  { type: "survey_subscribed", label: "Subscribers" },
  { type: "survey_free", label: "Free users" },
];

function isSurveyType(v: string | undefined): v is SurveyType {
  return v === "survey_subscribed" || v === "survey_free";
}

export default async function SurveyResponsesPage({
  searchParams,
}: {
  searchParams: Promise<{ survey?: string; page?: string }>;
}) {
  const { survey: surveyParam, page: pageParam } = await searchParams;
  const survey: SurveyType = isSurveyType(surveyParam) ? surveyParam : "survey_subscribed";
  const page = Math.max(1, Number(pageParam) || 1);

  const { rows, hasMore, total } = await getSurveyResponses(survey, page);
  const npsAverage = averageAnswer(rows, "nps");
  const questions = SURVEY_QUESTIONS[survey];

  const qs = (overrides: Record<string, string | undefined>) => {
    const merged = { survey, page: undefined as string | undefined, ...overrides };
    const params = new URLSearchParams();
    if (merged.survey) params.set("survey", merged.survey);
    if (merged.page) params.set("page", merged.page);
    return params.toString();
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/outreach" className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink">
          ← Back to outreach
        </Link>
        <h1 className="font-display mt-3 text-2xl font-bold">Survey responses</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">Only submitted answers.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <a
            key={t.type}
            href={`?${qs({ survey: t.type })}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              survey === t.type ? "border-brand/40 bg-brand/10 text-brand" : "border-line text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total responses" value={String(total)} />
        {npsAverage !== null && <StatCard label="Avg. NPS (this page)" value={npsAverage.toFixed(1)} sublabel="0–10" />}
      </section>

      {rows.length === 0 ? (
        <EmptyState icon="📝" title="No responses yet" description="Answers show up here as soon as someone submits the survey." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{r.email ?? "Unknown"}</span>
                  {r.tier && <Badge tone="brand">{TIER_LABEL[r.tier as Tier] ?? r.tier}</Badge>}
                </div>
                <span className="text-xs text-ink-dim">
                  {new Date(r.submittedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <dl className="mt-4 space-y-3">
                {questions.map((q) => {
                  const raw = r.answers[q.id];
                  if (!raw) return null;
                  return (
                    <div key={q.id}>
                      <dt className="text-xs font-medium text-ink-muted">{q.prompt}</dt>
                      <dd className="mt-0.5 text-sm text-ink">{answerLabel(q, raw)}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 text-xs">
        {page > 1 && (
          <a href={`?${qs({ page: String(page - 1) })}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Previous
          </a>
        )}
        {hasMore && (
          <a href={`?${qs({ page: String(page + 1) })}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Next
          </a>
        )}
      </div>
    </div>
  );
}
