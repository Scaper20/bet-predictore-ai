import { LeagueStatsLoading } from "@/components/stats/league-stats-loading";

export default function Loading() {
  return <LeagueStatsLoading eyebrow="Model ratings" title="Ratings" description="Every side rated 1 to 10." tiles={0} />;
}
