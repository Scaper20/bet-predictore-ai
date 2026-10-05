import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/site-settings";
import { MaintenanceForm } from "@/components/admin/maintenance-form";
import { Badge } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Maintenance" };

export default async function AdminMaintenancePage() {
  const settings = await getSiteSettings();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Maintenance mode</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Blocks the public site with a &ldquo;we&rsquo;ll be back soon&rdquo; page while you make major
          changes. Signed-in admins still see the real site, and the admin portal,
          payments webhook and scheduled jobs keep running.
        </p>
      </div>

      <section className="card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Status</h2>
          {settings.maintenanceEnabled ? (
            <Badge tone="amber">On — the site is blocked</Badge>
          ) : (
            <Badge tone="brand">Off — the site is live</Badge>
          )}
        </div>
        {settings.updatedAt && (
          <p className="text-xs text-ink-dim">
            Last changed{" "}
            {new Date(settings.updatedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
        <MaintenanceForm enabled={settings.maintenanceEnabled} message={settings.maintenanceMessage} />
      </section>

      <p className="text-xs text-ink-dim">
        Changes reach every visitor within about 10 seconds. To preview the page visitors get, open
        the site in a private window while maintenance mode is on.
      </p>
    </div>
  );
}
