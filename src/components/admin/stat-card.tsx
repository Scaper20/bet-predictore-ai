import { KpiTile } from "@/components/admin/kit";

/**
 * The admin pages' headline number, drawn as a KPI tile so every page reads
 * like the dashboards. Same props as the shared components/ui/stat-card.tsx,
 * which the account pages keep.
 */
export function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return <KpiTile label={label} value={value} hint={sublabel} />;
}
