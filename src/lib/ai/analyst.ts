/**
 * Natural-language match analysis.
 *
 * Two paths, and both are grounded in the same computed numbers:
 *
 *  - The deterministic writer always runs. It turns the fitted model output
 *    into readable analysis with no external dependency, which keeps the
 *    product fully functional without any AI vendor configured.
 *  - When ANTHROPIC_API_KEY is set, Claude rewrites that briefing into
 *    sharper prose. It is given the numbers and told to explain them; it is
 *    never asked to predict anything itself, because the moment a language
 *    model starts inventing statistics the product stops being trustworthy.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Prediction } from "@/lib/model/predict";
import { cached } from "@/lib/providers/cache";

export interface Analysis {
  /** One-line verdict. */
  headline: string;
  /** Two to four short paragraphs. */
  body: string[];
  /** Bullet-point drivers behind the read. */
  factors: string[];
  /** Where the write-up came from, surfaced in the UI. */
  source: "claude" | "model";
}

export const aiEnabled = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const pct = (v: number) => `${Math.round(v * 100)}%`;
const one = (v: number) => v.toFixed(2);

/**
 * Deterministic analysis built purely from the fitted model.
 *
 * Every sentence traces back to a number in the prediction, so this is safe to
 * show as-is and doubles as the factual brief handed to Claude.
 */
export function writeDeterministicAnalysis(p: Prediction): Analysis {
  const { markets: m, match, form, h2h, model } = p;
  const home = match.home.name;
  const away = match.away.name;

  const leader =
    m.home > m.away && m.home > m.draw
      ? { name: home, prob: m.home, side: "home" as const }
      : m.away > m.home && m.away > m.draw
        ? { name: away, prob: m.away, side: "away" as const }
        : { name: "the draw", prob: m.draw, side: "draw" as const };

  const goals = m.expectedGoals.total;
  const goalsLean = goals >= 2.9 ? "high-scoring" : goals <= 2.2 ? "tight" : "middling";

  const headline =
    !p.sufficiency.publishable
      ? `Not enough history to call ${home} vs ${away}`
      : leader.side === "draw"
        ? `Honours even: the draw is the single most likely result at ${pct(m.draw)}`
        : `${leader.name} favoured at ${pct(leader.prob)}, in a ${goalsLean} game`;

  const body: string[] = [];

  body.push(
    `The model projects ${one(m.expectedGoals.home)} goals for ${home} and ` +
      `${one(m.expectedGoals.away)} for ${away}, giving ${pct(m.home)} for the home win, ` +
      `${pct(m.draw)} for the draw and ${pct(m.away)} for the away win. ` +
      `Those rates come from attack and defence ratings fitted to ${model.matchesUsed} ` +
      `completed matches in this competition, weighted so recent results count for more.`,
  );

  const overLine = m.over["2.5"];
  body.push(
    `On goals, ${one(goals)} expected in total puts over 2.5 at ${pct(overLine)} and ` +
      `both teams to score at ${pct(m.bttsYes)}. ` +
      (overLine >= 0.55
        ? "The shape of the game favours backing goals rather than sitting on a result."
        : overLine <= 0.45
          ? "This projects as a cagey afternoon; the unders look the more solid side of the market."
          : "That is close enough to a coin flip that the goals markets offer little edge either way."),
  );

  if (form.home.entries.length > 0 || form.away.entries.length > 0) {
    const fh = form.home;
    const fa = form.away;
    body.push(
      `Recent form: ${home} have taken ${fh.points} points from their last ` +
        `${fh.entries.length} (${fh.entries.map((e) => e.result).join("")}), scoring ` +
        `${fh.goalsFor} and conceding ${fh.goalsAgainst}. ${away} have ${fa.points} from ` +
        `${fa.entries.length} (${fa.entries.map((e) => e.result).join("")}), scoring ` +
        `${fa.goalsFor} and conceding ${fa.goalsAgainst}.`,
    );
  }

  if (h2h.meetings > 0) {
    body.push(
      `Across the last ${h2h.meetings} meetings, ${home} have won ${h2h.homeWins}, ` +
        `${away} ${h2h.awayWins}, with ${h2h.draws} drawn and ${one(h2h.avgGoals)} goals a game. ` +
        `Head-to-head is a small sample and the model treats it as context, not evidence.`,
    );
  }

  const factors: string[] = [];
  const topScore = m.correctScore[0];
  if (topScore) {
    factors.push(
      `Most likely scoreline: ${topScore.home}-${topScore.away} at ${pct(topScore.probability)}`,
    );
  }
  factors.push(`Expected goals: ${one(m.expectedGoals.home)} - ${one(m.expectedGoals.away)}`);
  factors.push(
    `Clean sheet chance: ${home} ${pct(m.cleanSheet.home)}, ${away} ${pct(m.cleanSheet.away)}`,
  );
  if (p.ratings.home && p.ratings.away) {
    const diff = p.ratings.home.attack - p.ratings.away.attack;
    factors.push(
      diff > 0.15
        ? `${home} rate materially stronger in attack`
        : diff < -0.15
          ? `${away} rate materially stronger in attack`
          : "The two attacks rate close to level",
    );
  }
  factors.push(
    model.uncertainty > 0.95
      ? "Outcome spread is near-uniform — this is a genuinely open match"
      : `Model confidence is backed by ${Math.round(model.dataQuality)}/100 data quality`,
  );
  if (!p.sufficiency.publishable) factors.push(p.sufficiency.reason);

  return { headline, body, factors, source: "model" };
}

/**
 * Claude-written analysis, grounded in the deterministic brief.
 *
 * Falls back to the deterministic version on any failure — a missing key, a
 * rate limit, a timeout. The page always renders.
 */
export async function writeAnalysis(p: Prediction): Promise<Analysis> {
  const base = writeDeterministicAnalysis(p);
  if (!aiEnabled()) return base;

  // Predictions are stable between refreshes, so cache on the fixture and the
  // model's own read rather than paying for a call on every page view.
  const key = `ai:${p.match.id}:${Math.round(p.markets.home * 1000)}:${Math.round(
    p.markets.expectedGoals.total * 100,
  )}`;

  try {
    return await cached(key, 60 * 60_000, async () => {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 2000,
        // A short, well-specified writing task over numbers that are already
        // computed — low effort is the right spend here.
        output_config: { effort: "low" },
        system:
          "You are a football data analyst writing for a Nigerian audience. " +
          "You will be given the output of a Dixon-Coles goal model fitted to real " +
          "historical results. Your job is to explain what those numbers mean in " +
          "clear, confident prose.\n\n" +
          "Hard rules:\n" +
          "- Use ONLY the numbers provided. Never invent a statistic, injury, " +
          "lineup, transfer, or news event. You have no information beyond this brief.\n" +
          "- Never promise a result or imply an outcome is guaranteed.\n" +
          "- Write plainly. No hype, no emoji, no tipster cliches.\n" +
          "- Nigerian English is the register: direct and unfussy.\n\n" +
          "Respond in exactly this format:\n" +
          "HEADLINE: <one line, under 90 characters>\n" +
          "BODY: <2-3 paragraphs separated by a blank line>\n" +
          "FACTORS: <3-5 lines, each starting with '- '>",
        messages: [
          {
            role: "user",
            content: buildBrief(p, base),
          },
        ],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      const parsed = parseAnalysis(text);
      // A malformed response is not worth showing; keep the reliable version.
      return parsed ?? base;
    });
  } catch {
    return base;
  }
}

function buildBrief(p: Prediction, base: Analysis): string {
  const { markets: m, match, form, h2h, model } = p;
  const lines = [
    `Fixture: ${match.home.name} vs ${match.away.name}`,
    `Competition: ${match.league.name}`,
    `Kickoff (UTC): ${match.kickoff}`,
    "",
    "Model output:",
    `- Expected goals: ${one(m.expectedGoals.home)} (home) vs ${one(m.expectedGoals.away)} (away)`,
    `- Home win ${pct(m.home)}, draw ${pct(m.draw)}, away win ${pct(m.away)}`,
    `- Over 2.5 goals ${pct(m.over["2.5"])}, under 2.5 ${pct(m.under["2.5"])}`,
    `- Both teams to score ${pct(m.bttsYes)}`,
    `- Clean sheet: home ${pct(m.cleanSheet.home)}, away ${pct(m.cleanSheet.away)}`,
    `- Most likely scorelines: ${m.correctScore
      .slice(0, 4)
      .map((s) => `${s.home}-${s.away} (${pct(s.probability)})`)
      .join(", ")}`,
    `- Fitted on ${model.matchesUsed} completed matches; data quality ${Math.round(model.dataQuality)}/100`,
    `- Sample assessment: ${p.sufficiency.reason}`,
  ];

  if (form.home.entries.length) {
    lines.push(
      `- ${match.home.name} last ${form.home.entries.length}: ` +
        `${form.home.entries.map((e) => e.result).join("")}, ` +
        `${form.home.goalsFor} scored / ${form.home.goalsAgainst} conceded`,
    );
  }
  if (form.away.entries.length) {
    lines.push(
      `- ${match.away.name} last ${form.away.entries.length}: ` +
        `${form.away.entries.map((e) => e.result).join("")}, ` +
        `${form.away.goalsFor} scored / ${form.away.goalsAgainst} conceded`,
    );
  }
  if (h2h.meetings > 0) {
    lines.push(
      `- Head to head (last ${h2h.meetings}): ${match.home.name} ${h2h.homeWins} wins, ` +
        `${h2h.draws} draws, ${match.away.name} ${h2h.awayWins} wins, ` +
        `${one(h2h.avgGoals)} goals per game`,
    );
  }
  if (p.topPick) {
    lines.push(`- Model's strongest selection: ${p.topPick.label} at ${pct(p.topPick.probability)}`);
  } else {
    lines.push("- No selection is being published: the sample is too thin to stand behind one.");
  }

  lines.push("", "Reference write-up to improve on:", base.headline, ...base.body);
  return lines.join("\n");
}

/** Parse the HEADLINE / BODY / FACTORS envelope; null if it does not conform. */
function parseAnalysis(text: string): Analysis | null {
  const headline = /HEADLINE:\s*(.+)/i.exec(text)?.[1]?.trim();
  const bodyRaw = /BODY:\s*([\s\S]*?)(?:\nFACTORS:|$)/i.exec(text)?.[1]?.trim();
  const factorsRaw = /FACTORS:\s*([\s\S]*)$/i.exec(text)?.[1]?.trim();

  if (!headline || !bodyRaw) return null;

  const body = bodyRaw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const factors = (factorsRaw ?? "")
    .split("\n")
    .map((s) => s.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  if (body.length === 0) return null;
  return { headline, body, factors, source: "claude" };
}
