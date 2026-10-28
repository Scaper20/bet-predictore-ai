import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { DASHBOARD_LABEL, dashboardsFor, emailView, navFor, type DashboardView } from "@/lib/admin-access";
import { isMailAdmin } from "@/lib/admin-mail";
import { marketingDashboard, ownerDashboard, productDashboard, supportDashboard } from "@/lib/admin-dashboards";
import { PageHeader } from "@/components/admin/kit";
import { MarketingView, OwnerView, ProductView, SupportView, type DashContext } from "@/components/admin/dashboards";

export const metadata: Metadata = { title: "Dashboard" };

const SUMMARY: Record<DashboardView, string> = {
  owner: "Revenue, growth and the health of the whole operation, with what needs you first.",
  product: "Model accuracy, the data pipeline, today's Code Hub build and what users are telling us.",
  marketing: "Where signups come from, which of them pay, and the channels we own.",
  support: "Who is waiting on us, who is stuck, and what users are saying.",
};

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

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
  const name = me.email.split("@")[0];
  const updated = now.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <PageHeader
        eyebrow={DASHBOARD_LABEL[view]}
        title={
          <>
            {greeting(lagosHour)}, <span className="text-brand">{name}</span>
          </>
        }
        description={SUMMARY[view]}
        actions={
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
            Updated {updated} WAT ·{" "}
            <Link href={`/admin?view=${view}`} className="text-ink-muted underline underline-offset-2 hover:text-ink">
              refresh
            </Link>
          </span>
        }
      >
        {views.length > 1 && (
          <nav className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-shell p-1" aria-label="Dashboards">
            {views.map((v) => (
              <Link
                key={v}
                href={`/admin?view=${v}`}
                aria-current={v === view ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  v === view ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {DASHBOARD_LABEL[v]}
              </Link>
            ))}
          </nav>
        )}
      </PageHeader>

      {view === "owner" && <OwnerView d={await ownerDashboard()} ctx={ctx} />}
      {view === "product" && <ProductView d={await productDashboard()} ctx={ctx} />}
      {view === "marketing" && <MarketingView d={await marketingDashboard()} ctx={ctx} />}
      {view === "support" && <SupportView d={await supportDashboard()} ctx={ctx} />}
    </div>
  );
}
