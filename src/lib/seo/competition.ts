import type { SettledRecord } from "@/lib/performance";
import { MIN_PUBLISHABLE_SAMPLE } from "@/lib/performance";

/**
 * Copy for a competition hub page (CTO checklist 4.6). Every sentence is built
 * from a number the page also shows, with the date it was true, so an answer
 * engine can quote it and a reader can check it. With too few settled picks the
 * line says so and quotes no rate.
 */
export function trackRecordLine(name: string, record: SettledRecord | undefined, asOf: string): string {
  const sample = record?.sample ?? 0;
  if (!record || sample < MIN_PUBLISHABLE_SAMPLE || record.winRate === null) {
    return `As of ${asOf}, KiqStat has settled ${sample} published ${name} pick${sample === 1 ? "" : "s"}, too few to quote a hit rate. Every one is on the track record page.`;
  }
  return `As of ${asOf}, KiqStat has settled ${sample} published ${name} picks: ${record.wins} won and ${record.losses} lost, a ${Math.round(record.winRate * 100)}% hit rate. Wins and losses are all listed on the track record page.`;
}

export function competitionFaq(name: string, line: string): { q: string; a: string }[] {
  return [
    {
      q: `How are the ${name} predictions made?`,
      a: `KiqStat fits a statistical goal model (time-weighted Dixon-Coles Poisson) to completed ${name} results and publishes the chance of each outcome for every match. They are probabilities, not guarantees.`,
    },
    { q: `How accurate are KiqStat's ${name} predictions?`, a: line },
    {
      q: `Where can I see today's ${name} predictions?`,
      a: `On the ${name} page at KiqStat: the next fixtures with the model's chances, the table and the latest results are on one page, updated through the day.`,
    },
  ];
}
