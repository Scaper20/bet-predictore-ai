import { LeagueStatsLoading } from "@/components/stats/league-stats-loading";

export default function Loading() {
  return <LeagueStatsLoading eyebrow="Team form" title="Team form" description="Last ten league games, newest first." tiles={3} />;
}
