/**
 * The Ask lab's test questions (admin/ask-lab): 40 questions across the
 * kinds people ask, from a one-match lookup to an eight-pick combo. Teams and
 * fixtures are filled in from this week's real slate when a run starts, so
 * the tools return real data. Pure, so the filling is tested.
 */

export type BenchCategory = "simple" | "analysis" | "combo" | "tool_heavy" | "price" | "live" | "off_topic";

export interface BenchCase {
  id: string;
  category: BenchCategory;
  /** {fixture}, {home}, {away}, {league}, {fixture2} and {team2} come from the slate. */
  template: string;
}

export const BENCH_CASES: BenchCase[] = [
  // Simple match questions: one lookup, one short answer.
  { id: "s1", category: "simple", template: "Who wins {fixture}?" },
  { id: "s2", category: "simple", template: "Is {fixture} a high-scoring game?" },
  { id: "s3", category: "simple", template: "Will both teams score in {fixture}?" },
  { id: "s4", category: "simple", template: "What's the most likely score in {fixture}?" },
  { id: "s5", category: "simple", template: "When does {home} play next?" },
  { id: "s6", category: "simple", template: "Is {away} likely to win away at {home}?" },
  { id: "s7", category: "simple", template: "Over 2.5 goals in {fixture}, yes or no?" },
  { id: "s8", category: "simple", template: "How is {home}'s form lately?" },
  // Analysis: one fixture, several angles.
  { id: "a1", category: "analysis", template: "Break down {fixture} for me: form, head-to-head and the best pick." },
  { id: "a2", category: "analysis", template: "Compare {home} and {away}'s recent form and tell me who has the edge." },
  { id: "a3", category: "analysis", template: "What's the safest selection in {fixture} and why?" },
  { id: "a4", category: "analysis", template: "Is a draw possible in {fixture}? How likely?" },
  { id: "a5", category: "analysis", template: "Which is more likely in {fixture}: over 2.5 goals or both teams to score?" },
  { id: "a6", category: "analysis", template: "Give me the expected goals for {fixture} and what they mean for the score." },
  // Combos.
  { id: "c1", category: "combo", template: "Build me a safe 3-pick combo for today." },
  { id: "c2", category: "combo", template: "Give me 5 picks for the weekend with odds around 1.3 each." },
  { id: "c3", category: "combo", template: "I want a combo of about 3.0 total odds from {league} games." },
  { id: "c4", category: "combo", template: "Top 8 picks for the next 7 days, highest chance first." },
  { id: "c5", category: "combo", template: "Pair {fixture} with two other strong picks from today." },
  { id: "c6", category: "combo", template: "Safest double for tonight?" },
  // Tool-heavy: several fixtures, prices, cards.
  { id: "t1", category: "tool_heavy", template: "Compare {fixture} and {fixture2}: which has the better over 2.5 chance?" },
  { id: "t2", category: "tool_heavy", template: "Check prices for the top pick in {fixture} and {fixture2} and tell me which is better value." },
  { id: "t3", category: "tool_heavy", template: "Find every {team2} game this week and give me a pick for each." },
  { id: "t4", category: "tool_heavy", template: "Give me one pick from each of three different leagues this weekend, with prices." },
  { id: "t5", category: "tool_heavy", template: "Which of today's games is most likely to have both teams scoring? Show me the top three." },
  { id: "t6", category: "tool_heavy", template: "Build a 4-pick combo, check each price, and tell me the combined chance." },
  // Price and value.
  { id: "p1", category: "price", template: "Is 1.85 a good price for {home} to win against {away}?" },
  { id: "p2", category: "price", template: "Is over 2.5 goals in {fixture} worth taking at 2.10?" },
  { id: "p3", category: "price", template: "What price should I expect for both teams to score in {fixture}?" },
  { id: "p4", category: "price", template: "Is the market price on {away} too short?" },
  { id: "p5", category: "price", template: "Any value picks today?" },
  { id: "p6", category: "price", template: "Is 1.40 for {home} or draw a good price?" },
  // Live.
  { id: "l1", category: "live", template: "What games are on right now?" },
  { id: "l2", category: "live", template: "What's the score in the {home} game?" },
  { id: "l3", category: "live", template: "Any live games with goals so far?" },
  // Off-topic and edge cases: should stay short and cheap.
  { id: "o1", category: "off_topic", template: "Who will win the next election?" },
  { id: "o2", category: "off_topic", template: "Is {home}'s striker injured?" },
  { id: "o3", category: "off_topic", template: "Give me a sure win, 100% guaranteed." },
  { id: "o4", category: "off_topic", template: "hi" },
  { id: "o5", category: "off_topic", template: "I lost a lot this week, how do I win it all back tomorrow?" },
];

export interface SlateFixture {
  home: string;
  away: string;
  league: string;
}

/** Fills a case from the slate, rotating through fixtures so the run covers several games and leagues. */
export function fillCase(c: BenchCase, slate: SlateFixture[], index: number): string {
  if (slate.length === 0) return c.template.replace(/\{fixture2?\}/g, "Arsenal v Chelsea").replace(/\{home\}|\{team2\}/g, "Arsenal").replace(/\{away\}/g, "Chelsea").replace(/\{league\}/g, "Premier League");
  const a = slate[index % slate.length];
  const b = slate[(index + 7) % slate.length];
  return c.template
    .replace(/\{fixture\}/g, `${a.home} v ${a.away}`)
    .replace(/\{fixture2\}/g, `${b.home} v ${b.away}`)
    .replace(/\{home\}/g, a.home)
    .replace(/\{away\}/g, a.away)
    .replace(/\{team2\}/g, b.home)
    .replace(/\{league\}/g, a.league);
}
