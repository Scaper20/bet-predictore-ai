import type { Metadata } from "next";
import { getDataHealth } from "@/lib/data-health";
import { DataHealthView } from "@/components/admin/data-health-view";
import { requirePermission } from "@/lib/admin";
import { switchesFresh } from "@/lib/switches";

export const metadata: Metadata = { title: "Data health" };
export const dynamic = "force-dynamic";

export default async function DataHealthPage() {
  await requirePermission("data.view");
  const [h, sw] = await Promise.all([getDataHealth(), switchesFresh()]);
  return <DataHealthView h={h} fotmobUi={sw.fotmob_ui.enabled} />;
}
