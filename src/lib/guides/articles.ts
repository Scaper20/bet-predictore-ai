/**
 * Question-style guide articles (CTO checklist 4.6): one page per question, so
 * each can rank and be quoted for its own question. Plain data, so the copy is
 * tested; the page at /guides/[slug] renders it. Every example is arithmetic or
 * labelled illustrative, and no article quotes a hit rate (that lives, dated, on
 * the track record page).
 */
export interface Article {
  slug: string;
  title: string;
  /** Meta description, 160 characters or fewer. */
  description: string;
  /** The answer, in two sentences, before anything else. */
  answer: string;
  sections: { heading: string; paragraphs: string[] }[];
  /** ISO date the text was last checked against the product. */
  reviewed: string;
  related: { label: string; href: string }[];
}

export const REVIEWED = "2026-11-06";

export const ARTICLES: Article[] = [
  {
    slug: "what-does-a-70-percent-chance-mean",
    title: "What does a 70% chance mean in a football prediction?",
    description: "A 70% chance means the result should happen about 7 times in 10 and miss about 3. Why a miss does not mean the prediction was wrong, and how to use it.",
    answer: "A 70% chance means that if you could replay the same situation ten times, the result should land about seven times and miss about three. A miss does not make the prediction wrong; it is what 70% means.",
    sections: [
      { heading: "Why a miss is built in", paragraphs: ["No football model can know the result in advance. It can only say how often a result tends to happen in situations like this one. A 70% pick that loses has not failed: three in ten of them are supposed to lose.", "The only fair way to judge a probability is over many picks. If picks given 70% win about 70% of the time, the numbers are honest, even though each single one can lose."] },
      { heading: "What it does to a combo", paragraphs: ["In a combo every pick has to win, so the chances multiply. Five picks at 70% each give 0.7 × 0.7 × 0.7 × 0.7 × 0.7, about 17%: all five land roughly one time in six.", "This is why fewer, stronger picks usually beat long combos, and why Forge shows the combined chance of every combo it builds."] },
      { heading: "How to use a chance", paragraphs: ["Compare the chance with the price on offer. A price of 1.50 implies 1 ÷ 1.50 = 67%. If the model says 70%, the price is close to fair; if it says 55%, the price is too short for the risk.", "Never stake money you cannot afford to lose on any single result, whatever the chance says."] },
    ],
    reviewed: REVIEWED,
    related: [{ label: "A price is a probability in disguise", href: "/guides#prices" }, { label: "How our picks work", href: "/how-it-works" }],
  },
  {
    slug: "btts-gg-ng-explained",
    title: "BTTS, GG and NG explained: both teams to score",
    description: "BTTS, GG and NG are the same market: whether both teams score. What Yes and No mean, worked examples, and how to read the chance next to the price.",
    answer: "Both teams to score (BTTS) is also called GG (goal-goal) for Yes and NG (no goal) for No. Yes wins if each team scores at least once in normal time; No wins if at least one team fails to score.",
    sections: [
      { heading: "Worked examples", paragraphs: ["A 1-1 draw: Yes is right, because both scored. A 1-0 win: No is right, because the losing side scored nothing. A 0-0 draw: No is right. A 3-2 win: Yes is right.", "Only goals in the 90 minutes plus stoppage time count. Extra time and penalties do not."] },
      { heading: "What drives the chance", paragraphs: ["Two things matter: how often each team scores against sides like this one, and how often each concedes. KiqStat's model turns those into an expected number of goals for each side and reads the chance of both scoring from the same scoreline distribution as every other market, so BTTS never contradicts the result or the over/under."] },
      { heading: "Reading it next to the price", paragraphs: ["Divide 1 by the price to see the chance it implies. A Yes price of 1.80 implies 56%. If the model's chance for Yes is higher than that, the price is generous; if lower, it is short."] },
    ],
    reviewed: REVIEWED,
    related: [{ label: "All prediction types", href: "/guides#types" }, { label: "Goals statistics by team", href: "/football/goals-stats" }],
  },
  {
    slug: "over-under-2-5-goals-explained",
    title: "Over/under 2.5 goals explained",
    description: "Over 2.5 needs three or more goals in a match, under 2.5 needs two or fewer. How the line works, examples, and how to read the chance against the price.",
    answer: "Over 2.5 goals wins if the match has three or more goals; under 2.5 wins if it has two or fewer. The half goal in the line means the bet can never be a draw, so it always settles as a win or a loss.",
    sections: [
      { heading: "Examples", paragraphs: ["A 2-1 win has three goals, so over 2.5 is right. A 1-1 draw has two goals, so under 2.5 is right. A 0-0 draw is under. A 4-0 win is over.", "Other lines work the same way: over 1.5 needs two or more goals, over 3.5 needs four or more."] },
      { heading: "Why the average is not enough", paragraphs: ["Two sides that average 1.4 goals each do not always produce 2.8 goals. Goals come in whole numbers, so the model works out the chance of every scoreline and adds up the ones above and below the line. That is why the chance of over 2.5 can differ a lot between two matches with the same average."] },
      { heading: "Using the chance", paragraphs: ["Turn the price into a chance (1 ÷ price) and compare. An over 2.5 price of 2.00 implies 50%. If the model puts the chance well above that, the price is generous; if below, it is not worth the risk."] },
    ],
    reviewed: REVIEWED,
    related: [{ label: "All prediction types", href: "/guides#types" }, { label: "How our picks work", href: "/how-it-works" }],
  },
  {
    slug: "double-chance-explained",
    title: "Double chance explained: 1X, X2 and 12",
    description: "Double chance covers two of the three results at once: home or draw (1X), draw or away (X2), home or away (12). How it works and why the price is shorter.",
    answer: "Double chance covers two of the three match results with one pick: 1X is home win or draw, X2 is draw or away win, and 12 is home or away win with no draw. It is more likely than any single result, so the price is shorter.",
    sections: [
      { heading: "How the chance is worked out", paragraphs: ["Add the chances of the two results. Illustration only: if a match is home 50%, draw 28%, away 22%, then 1X is 78%, X2 is 50% and 12 is 72%.", "Because KiqStat reads every market from one scoreline distribution, the double chance always agrees with the match result chances."] },
      { heading: "The trade-off", paragraphs: ["A higher chance comes with a shorter price, so a double chance is not automatically better value. The question is the same as for any pick: is the price longer than the chance deserves? Divide 1 by the price and compare."] },
      { heading: "When it settles", paragraphs: ["Double chance is settled on the result after 90 minutes plus stoppage time. A 1X pick on a home side that loses is wrong; if the match is drawn it is right."] },
    ],
    reviewed: REVIEWED,
    related: [{ label: "All prediction types", href: "/guides#types" }, { label: "Today's predictions", href: "/football/predictions" }],
  },
  {
    slug: "how-accurate-are-football-predictions",
    title: "How accurate are football predictions?",
    description: "Hit rate alone does not show if predictions are good. How to judge football predictions fairly, and where to see KiqStat's own settled record, wins and losses.",
    answer: "No football prediction is accurate all the time; the honest test is whether the stated chances match how often results happen, measured over many picks. KiqStat publishes every settled pick, wins and losses, on its track record page, with the current figures.",
    sections: [
      { heading: "Why one number misleads", paragraphs: ["A high hit rate can come from only picking very likely results at very short prices, which pay little. A low hit rate can still be profitable at longer prices. Hit rate alone says little about quality.", "Two checks matter more: whether picks given a 60% chance win about 60% of the time, and whether the price taken was better than the chance deserved."] },
      { heading: "What to look for in a record", paragraphs: ["Every pick listed, losses included. Picks logged before kick-off, not after. A stated number of picks behind each figure, because a hit rate from 10 picks means much less than one from 500. Dates on the figures.", "KiqStat follows these rules: picks are logged before kick-off and settled automatically against the final score, and a rate is quoted only once there are enough settled picks behind it."] },
      { heading: "Where to see ours", paragraphs: ["The track record page lists every settled pick and the current counts, and each competition page shows its own record with the date. We do not quote a hit rate from memory, because the figure moves every day."] },
    ],
    reviewed: REVIEWED,
    related: [{ label: "KiqStat track record", href: "/football/track-record" }, { label: "How our picks work", href: "/how-it-works" }],
  },
  {
    slug: "how-to-check-a-booking-code",
    title: "How to check a booking code before you play it",
    description: "A booking code loads someone else's picks onto your slip. How to check each leg's chance, spot risky legs and edit a code before you play it.",
    answer: "A booking code copies a slip of picks made by someone else. Before you play it, check the chance of each leg and of the whole slip, because every leg has to win and the risk multiplies.",
    sections: [
      { heading: "What to check", paragraphs: ["The chance of each leg, not just the total odds. One weak leg at 35% drags a whole slip down however strong the others are.", "The number of legs. Five legs at 70% each land together about 17% of the time; ten legs at 70% land about 3% of the time (0.7 to the power of 10).", "Whether any leg is on a match that has already started or has a changed price."] },
      { heading: "How Code Hub helps", paragraphs: ["Code Hub lets a signed-in user check any booking code, shows the model's chance for the legs, and lets you make the code safer by editing it. The code editor swaps or drops weak legs and builds a new code from what you keep. A new code made from your own picks or edits uses your weekly allowance."] },
      { heading: "A reminder", paragraphs: ["A chance is not a promise. Stake only what you can afford to lose, and take a break if it stops being fun. KiqStat is for adults only (18+)."] },
    ],
    reviewed: REVIEWED,
    related: [{ label: "Code Hub", href: "/football/code-hub" }, { label: "Responsible use", href: "/responsible-use" }],
  },
];

export function articleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
