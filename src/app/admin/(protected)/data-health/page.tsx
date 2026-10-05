import type { Metadata } from "next";
import { getDataHealth } from "@/lib/data-health";
import { DataHealthView } from "@/components/admin/data-health-view";

export const metadata: Metadata = { title: "Data health" };
export const dynamic = "force-dynamic";

export default async function DataHealthPage() {
  return <DataHealthView h={await getDataHealth()} />;
}
