import { LeagueStatsLoading } from "@/components/stats/league-stats-loading";

export default function Loading() {
  return <LeagueStatsLoading eyebrow="Goals stats" title="Goals" description="Goal rates over the last ten league games." tiles={4} />;
}
