import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { DASHBOARD_LABEL, dashboardsFor, emailView, navFor, type DashboardView } from "@/lib/admin-access";
import { isMailAdmin } from "@/lib/admin-mail";
import { marketingDashboard, ownerDashboard, productDashboard, supportDashboard } from "@/lib/admin-dashboards";
import { PageHeader } from "@/components/admin/kit";
import { DashboardActions, MarketingView, OwnerView, ProductView, SupportView, type DashContext } from "@/components/admin/dashboards";

export const metadata: Metadata = { title: "Dashboard" };

const SUMMARY: Record<DashboardView, string> = {
  owner: "Revenue, growth and the health of the whole operation, with what needs you first.",
  product: "Model accuracy, the data pipeline, today's Code Hub build and what users are telling us.",
  marketing: "Where signups come from, which of them pay, and the channels we own.",
  support: "Who is waiting on us, who is stuck, and what users are saying.",
};

/**
 * Every staff member lands here, on the dashboard of their role. The owner
 * can open each role's dashboard from the tabs (to see what the team sees);
 * someone with two roles gets both. Only the loader of the dashboard on show
 * runs.
 */
export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const me = await requireAdmin();
  const views = dashboardsFor(me.roles);
  const asked = (await searchParams).view;
  const view = views.find((v) => v === asked) ?? views[0];

  const now = new Date();
  const lagosHour = Number(now.toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hour12: false })) % 24;
  const openable = new Set(
    navFor(me.roles, new Set(isMailAdmin(me.email) ? [] : ["/admin/mail"])).flatMap((s) => s.items.map((i) => i.href)),
  );
  const ctx: DashContext = {
    canOpen: (href) => openable.has(href),
    showEmail: emailView(me.roles),
    lagosHour,
  };
  const updated = now.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });

  // Data first, so the header can carry the role's main action. Only the
  // loader of the dashboard on show runs.
  // `outcome` is what the primary action is worth right now; the button
  // shows it on hover (pass 3 of the redesign). None when there is nothing
  // at stake, and the label just stays.
  let body: React.ReactNode;
  let outcome: string | undefined;
  const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  if (view === "owner") {
    const d = await ownerDashboard();
    body = <OwnerView d={d} ctx={ctx} />;
    if (d.renewals.attention) outcome = `Save ${plural(d.renewals.attention, "renewal")}`;
  } else if (view === "product") {
    const d = await productDashboard();
    body = <ProductView d={d} ctx={ctx} />;
    if (d.ingest.failed24h) outcome = `Fix ${plural(d.ingest.failed24h, "failed run")}`;
  } else if (view === "marketing") {
    const d = await marketingDashboard();
    body = <MarketingView d={d} ctx={ctx} />;
    if (d.audience.reachable) outcome = `Reach ${plural(d.audience.reachable, "person", "people")}`;
  } else {
    const d = await supportDashboard();
    body = <SupportView d={d} ctx={ctx} />;
    if (d.tickets.open) outcome = `Clear ${d.tickets.open.toLocaleString()} open`;
  }

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            Dashboard ·{" "}
            <Link href={`/admin?view=${view}`} className="text-ink-dim hover:text-ink" title="Refresh">
              updated {updated} WAT
            </Link>
          </>
        }
        title={DASHBOARD_LABEL[view]}
        description={SUMMARY[view]}
        actions={<DashboardActions view={view} ctx={ctx} outcome={outcome} />}
      >
        {views.length > 1 && (
          <nav className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-shell p-1" aria-label="Dashboards">
            {views.map((v) => (
              <Link
                key={v}
                href={`/admin?view=${v}`}
                aria-current={v === view ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  v === view ? "bg-surface-3 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {DASHBOARD_LABEL[v]}
              </Link>
            ))}
          </nav>
        )}
      </PageHeader>

      {body}
    </div>
  );
}
