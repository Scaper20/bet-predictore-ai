import type { Metadata } from "next";
import Link from "next/link";
import { containerClass } from "@/components/ui/container";
import { Faq, type FaqGroup } from "@/components/guides/faq";
import { planById } from "@/lib/pricing";
import { ASK_FREE_DAILY, ASK_GUEST_TOTAL } from "@/lib/ask/request";
import { FORGE_FREE_DAILY } from "@/lib/forge";
import { naira } from "@/lib/format";
import { flutterwaveConfigured } from "@/lib/flutterwave/client";
import { ELSEWHERE, formatMoney } from "@/lib/payments/markets";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Help Centre",
  description: "Answers about accounts, plans and payments, predictions, Forge and slips, and responsible gambling on BetriX.",
  alternates: { canonical: "/help" },
};

const pro = naira(planById("pro").price.monthly ?? 0);
const vip = naira(planById("vip").price.monthly ?? 0);
// Payers outside Nigeria get local prices once Flutterwave is configured.
const sellsAbroad = flutterwaveConfigured();
const usd = (tier: "pro" | "vip") => formatMoney(ELSEWHERE.prices?.[tier].monthly ?? 0, "USD");

const A = ({ children }: { children: React.ReactNode }) => <p>{children}</p>;
const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-semibold text-brand hover:underline">{children}</Link>
);

const GROUPS: FaqGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "Is BetriX free?",
        text: "Live scores fixtures results tables predictions free account markets",
        a: <A>Yes. Live scores, fixtures, results, league tables, team stats and every pick and every market (1X2, over/under, GG/NG, double chance, correct score) are free, with {FORGE_FREE_DAILY} Forge slips a day (1X2 and double chance) and {ASK_FREE_DAILY} Ask BetriX questions a day. Pro adds Asian handicap, half-time markets, the full written breakdowns and more.</A>,
      },
      {
        q: "Do I need an account?",
        text: "account sign up guest",
        a: <A>Not to browse. Without one you can try Forge and Ask BetriX a couple of times ({ASK_GUEST_TOTAL} questions in total). An account (free, email or Google) lets you follow your leagues, save and track slips, and get more each day. <L href="/account/sign-up">Create one</L>.</A>,
      },
      {
        q: "How do I choose my leagues?",
        text: "for you leagues preferences follow",
        a: <A>Open <L href="/account#preferences">your account</L> and pick the competitions you follow. Your For You page then shows only those, first.</A>,
      },
      {
        q: "Can I install BetriX on my phone?",
        text: "app install phone home screen android iphone",
        a: <A>Yes, without an app store. On Android, open the menu in Chrome and choose &ldquo;Install app&rdquo;; on iPhone, tap Share in Safari and &ldquo;Add to Home Screen&rdquo;. You&apos;ll get kick-off and result notifications if you allow them.</A>,
      },
    ],
  },
  {
    id: "plans",
    title: "Plans and payments",
    items: [
      {
        q: "What does each plan cost?",
        text: "price cost pass pro vip naira",
        a: sellsAbroad ? (
          <A>In Nigeria, Pro is {pro} a month (cheaper if you pay for 3 months or a year) and VIP {vip} a month. Elsewhere in Africa they are priced in your own currency, and in US dollars everywhere else (Pro {usd("pro")}, VIP {usd("vip")} a month). The <L href="/pricing">pricing page</L> shows the prices where you are.</A>
        ) : (
          <A>Pro is {pro} a month (cheaper if you pay for 3 months or a year) and VIP {vip} a month. Everything is on the <L href="/pricing">pricing page</L>.</A>
        ),
      },
      {
        q: "What happened to passes?",
        text: "pass day weekend week one-off",
        a: <A>Passes are no longer sold; everything they unlocked is now in Pro. A pass you already bought keeps working until it runs out.</A>,
      },
      {
        q: "How do I pay?",
        text: "pay paystack flutterwave card transfer ussd mobile money mpesa",
        a: sellsAbroad ? (
          <A>In Nigeria through Paystack, in naira, by card or bank transfer. Elsewhere through Flutterwave, in your own currency: Mobile Money, M-Pesa or card. Outside Nigeria each payment buys a set period that never renews. We never see or store your card details.</A>
        ) : (
          <A>Through Paystack, in naira, by card or bank transfer. We never see or store your card details.</A>
        ),
      },
      {
        q: "How do I cancel?",
        text: "cancel subscription renewal refund",
        a: <A>From <L href="/account/billing">Plan &amp; billing</L>, any time. Cancelling stops the next renewal; you keep access for the time already paid for.</A>,
      },
      {
        q: "I paid but my plan didn't unlock",
        text: "paid not unlocked payment failed problem",
        a: <A>It usually unlocks within a minute. Refresh the page and check <L href="/account/billing">Plan &amp; billing</L>. If it still hasn&apos;t, message support from the chat button with your payment reference and we&apos;ll sort it.</A>,
      },
    ],
  },
  {
    id: "predictions",
    title: "Predictions",
    items: [
      {
        q: "How are the predictions made?",
        text: "model how predictions work statistics",
        a: <A>From a statistical model fitted on thousands of real results: team ratings, a chance for every scoreline, and every market from that. No tipsters. The full story is in <L href="/how-it-works">How our picks work</L>.</A>,
      },
      {
        q: "Why does a game say “no pick”?",
        text: "no pick not enough history insufficient",
        a: <A>The competition, or one of the teams, doesn&apos;t have enough finished games behind it to trust the numbers. We list the game but don&apos;t publish a pick rather than guess.</A>,
      },
      {
        q: "What is a Strong pick?",
        text: "strong pick star banker confident safest",
        a: <A>Our most confident picks, about one game in six, marked ★ Strong before kick-off. In testing on past seasons they landed about 4 times in 5, against about 3 in 4 for all picks. They come at shorter odds, and they still lose sometimes. The <L href={sportPath("trackRecord")}>track record</L> shows the Strong record on its own, next to every pick.</A>,
      },
      {
        q: "How accurate are you?",
        text: "accuracy track record win rate",
        a: <A>Every pick is logged before kick-off and graded after. The <L href={sportPath("trackRecord")}>track record</L> shows all of it, by league and market, wins and losses alike.</A>,
      },
      {
        q: "What are model ratings?",
        text: "ratings 1-10 elo strength",
        a: <A>Every team rated 1 to 10 from its results: beating strong teams lifts a rating more than beating weak ones. Each league is rated against itself. <L href={sportPath("ratings")}>See the ratings</L>.</A>,
      },
    ],
  },
  {
    id: "tools",
    title: "Forge, slips and Ask BetriX",
    items: [
      {
        q: "What is Forge?",
        text: "forge slip builder accumulator",
        a: <A>Tell it your style, the total odds you want and your markets; it picks the games and shows the chance of the whole slip landing. BetriX doesn&apos;t take bets: copy the slip to your bookmaker.</A>,
      },
      {
        q: "Can I place bets on BetriX?",
        text: "place bet stake bookmaker sportybet",
        a: <A>No. BetriX is analysis only. We show probabilities and prices; you place bets with your own bookmaker, if you choose to.</A>,
      },
      {
        q: "How do I track a slip?",
        text: "track slip live my slips",
        a: <A>Add games to your selections, then &ldquo;Track this slip&rdquo;. <L href={sportPath("trackedSlips")}>My slips</L> follows every leg live and marks each one won or lost.</A>,
      },
      {
        q: "How many questions can I ask Ask BetriX?",
        text: "ask betrix questions limit ai",
        a: <A>{ASK_GUEST_TOTAL} without an account, {ASK_FREE_DAILY} a day on a free account, and plenty on any paid plan (fair use applies).</A>,
      },
    ],
  },
  {
    id: "safety",
    title: "Safety and responsible gambling",
    items: [
      {
        q: "I'm worried about my gambling",
        text: "addiction help problem gambling support",
        a: <A>You&apos;re not alone and help is free. Our <L href="/responsible-gambling">responsible gambling page</L> lists support lines and tools to set limits or take a break.</A>,
      },
      {
        q: "Who can use BetriX?",
        text: "age 18 who can use",
        a: <A>Adults only: you must be 18 or over.</A>,
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <header className="relative overflow-hidden border-b border-line bg-shell">
        <div aria-hidden className="bg-grid mask-fade-b pointer-events-none absolute inset-0 opacity-40" />
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
        <div className={`${containerClass("narrow")} relative py-10 text-center sm:py-16`}>
          <p className="animate-rise mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand">Help centre</p>
          <h1 className="animate-rise font-display text-4xl font-bold sm:text-6xl" style={{ animationDelay: "80ms" }}>How can we help?</h1>
          <p className="animate-rise mx-auto mt-4 max-w-lg text-base text-ink-muted" style={{ animationDelay: "160ms" }}>
            Quick answers about your account, plans, predictions and tools.
          </p>
          <div className="animate-rise mt-6 flex flex-wrap justify-center gap-2" style={{ animationDelay: "240ms" }}>
            {GROUPS.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-brand/40 hover:text-ink">
                {g.title}
              </a>
            ))}
          </div>
        </div>
      </header>
      <div className={`${containerClass("prose")} space-y-10 py-8 sm:py-12`}>
        <Faq groups={GROUPS} />
        <div className="card flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold">Still stuck?</p>
            <p className="mt-1 text-sm text-ink-muted">Message support from the chat button at the bottom of any page. Signed-in members get a reply in the same thread.</p>
          </div>
          <Link href="/guides" className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2">
            Read the guides
          </Link>
        </div>
      </div>
    </>
  );
}
