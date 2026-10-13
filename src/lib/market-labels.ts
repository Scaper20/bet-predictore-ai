/**
 * Display names for the model's pick groups. The group strings themselves
 * stay as they are because they key server logic (gating, Forge, Ask tools);
 * this is only what a reader sees.
 */
const GROUP_LABELS: Record<string, string> = {
  "Match Result": "Match result",
  Goals: "Goals",
  "Both Teams To Score": "Both teams to score",
  "Double Chance": "Two results",
  "Correct Score": "Correct score",
  "Asian Handicap": "Winning margin",
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}
