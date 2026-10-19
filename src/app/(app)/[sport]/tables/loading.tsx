import { LeagueStatsLoading } from "@/components/stats/league-stats-loading";

export default function Loading() {
  return <LeagueStatsLoading eyebrow="League tables" title="League table" description="Standings that move as goals go in." tiles={0} />;
}
