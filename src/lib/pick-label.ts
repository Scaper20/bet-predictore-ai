/**
 * A pick's name, shortened for the dense Picks list, where it shares a line
 * with the risk label: "Home under 5.5 shots on target" read as two lines
 * on a phone. Only the long statistics names change; the match page and
 * the row's tooltip keep the full name.
 *
 *   Home under 5.5 shots on target       -> Home under 5.5 SOT
 *   Away +3.5 shots on target handicap   -> Away +3.5 SOT handicap
 *   Home level or more shots on target   -> Home level or more SOT
 */
export function shortPickLabel(label: string): string {
  return label.replace(/\bshots on target\b/gi, "SOT");
}
