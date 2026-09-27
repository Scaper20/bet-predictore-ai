import type { Metadata } from "next";
import { getFeedback } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Feedback" };

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { rows, hasMore, averageScore } = await getFeedback(page);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Feedback</h1>
        <p className="mt-1 text-sm text-ink-muted">Submitted through the feedback tab on the live site — signed in or anonymous.</p>
      </div>

      {averageScore !== null && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Avg. score (this page)" value={averageScore.toFixed(1)} sublabel="0–10, would-recommend" />
        </section>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="💡" title="No feedback yet" description="Responses from the feedback tab on the live site will show up here." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {r.score !== null && (
                    <span className="grid size-9 place-items-center rounded-full bg-brand/12 text-sm font-bold text-brand">
                      {r.score}
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium text-ink">{r.email ?? "Anonymous"}</p>
                    <p className="text-xs text-ink-dim">{r.pagePath ?? "—"}</p>
                  </div>
                </div>
                <span className="text-xs text-ink-dim">
                  {new Date(r.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {r.comment && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 text-xs">
        {page > 1 && (
          <a href={`?page=${page - 1}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Previous
          </a>
        )}
        {hasMore && (
          <a href={`?page=${page + 1}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
            Next
          </a>
        )}
      </div>
    </div>
  );
}
