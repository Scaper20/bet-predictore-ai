import type { Metadata } from "next";
import { getForYouFeed } from "@/lib/for-you";
import { ForYouDashboard } from "@/components/for-you/for-you-dashboard";

export const metadata: Metadata = {
  title: "For You — Personalized Football Intelligence | BetriX",
  description:
    "Your personalized football predictions, custom accumulator suggestions, and value bet alerts tailored to your favorite leagues and intent.",
};

export const revalidate = 60;

export default async function ForYouPage() {
  const feed = await getForYouFeed();
  return <ForYouDashboard feed={feed} />;
}
