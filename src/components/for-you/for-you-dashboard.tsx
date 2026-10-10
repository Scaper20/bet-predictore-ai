"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccaSuggestion, ForYouFeedPayload, PersonalizedPick } from "@/lib/for-you";
import { Badge, ButtonLink, Button, EmptyState, LiveDot, SectionHeading } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { useSlip } from "@/lib/slip";
import { percent } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import { sportPath } from "@/lib/routes";
import { Crest } from "@/components/ui/crest";
import { isStrong } from "@/lib/model/tiers";
import { StrongBadge } from "@/components/ui/strong-badge";
import { CommentThread, LoveButton, useSocialCounts } from "@/components/for-you/pick-social";
import { useLivePicks } from "@/components/for-you/use-live-picks";
import { isLockedPick } from "@/lib/access";
import { LockedSelection, ProTag } from "@/components/entitlements/locked-pick";
import type { Pick } from "@/lib/model/predict";
import { isStaleInPlay } from "@/lib/match-status";
import type { LegScore } from "@/lib/slip-tracker";
import { useTickingMinute } from "@/components/match/use-live-clock";

/**
 * The personalised dashboard.
 *
 * Every figure on this page comes from the fitted model or from settled rows
 * in predictions_log. There is no odds feed in this product, so there is no
 * bookmaker price and no expected value — the previous version manufactured
 * both, and floored the EV at +8% so every pick appeared to carry an edge.
 *
 * The surface is what the model thinks the probability is. The break-even
 * price and sample size stay internal (October 2026: users asked for less).
 * A user who wants a real EV enters their own bookmaker's price on the slip,
 * which is what slip-view.tsx was built for.
 */
export function ForYouDashboard({ feed }: { feed: ForYouFeedPayload }) {
  const { add } = useSlip();
  const allPicks = [...feed.inYourLeagues.slice(0, 6), ...(feed.bestBet ? [feed.bestBet] : []), ...feed.quickPicks];
  const live = useLivePicks(allPicks);
  const social = useSocialCounts([
    ...feed.inYourLeagues.slice(0, 6).map((p) => p.id),
    ...(feed.bestBet ? [feed.bestBet.id] : []),
    ...feed.quickPicks.map((p) => p.id),
  ]);
  const [added, setAdded] = useState<string | null>(null);

  // One timer, cleared on unmount and on every replacement — the previous
  // version left two dangling setTimeouts calling setState after teardown.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flash = useCallback((key: string) => {
    setAdded(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(null), 2500);
  }, []);

  const addPick = useCallback(
    (pick: PersonalizedPick) => {
      add({
        matchId: pick.id,
        fixture: `${pick.homeTeam} vs ${pick.awayTeam}`,
        league: pick.league.shortName,
        kickoff: pick.kickoff,
        market: pick.market,
        label: pick.label,
        probability: pick.probability,
        fairOdds: pick.fairOdds,
        // bookmakerOdds is deliberately omitted. It is the field slip-view
        // reads to decide whether the user has supplied a real price, so
        // filling it here would present a model number as a market one.
      });
      flash(pick.id);
    },
    [add, flash],
  );

  const addAcca = useCallback(
    (acca: AccaSuggestion) => {
      for (const leg of acca.legs) {
        add({
          matchId: leg.matchId,
          fixture: leg.fixture,
          league: leg.league,
          kickoff: leg.kickoff,
          market: leg.market,
          label: leg.selection,
          probability: leg.probability,
          fairOdds: leg.fairOdds,
        });
      }
      flash("acca");
    },
    [add, flash],
  );

  const predictionsHref = sportPath("predictions", feed.sport);

  return (
    <Container width="shell" className="space-y-10 pb-14 pt-6 sm:space-y-14 sm:pb-20 sm:pt-8">
      <section>
        {/* The page opens on the feed itself: no page title or explainer
            above it, just what it is and whose leagues these are. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand" aria-hidden>
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M10 17s-6-3.6-6-8.2A3.4 3.4 0 0 1 10 6.4a3.4 3.4 0 0 1 6 2.4C16 13.4 10 17 10 17Z" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold leading-tight">In your leagues</h2>
              {feed.usingDefaults && (
                <p className="text-xs text-ink-dim">A starting set until you choose your own competitions.</p>
              )}
            </div>
          </div>
          <ButtonLink href={predictionsHref} variant="secondary" className="px-4 py-2 text-xs">
            All predictions →
          </ButtonLink>
        </div>

        <div className="no-scrollbar -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {feed.followedLeagues.map((league) => (
            <span
              key={league.code}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink"
            >
              <span aria-hidden>{league.flag}</span>
              <span>{league.shortName}</span>
            </span>
          ))}
          {feed.signedIn && (
            <Link
              href="/account#preferences"
              className="ml-1 shrink-0 text-xs font-semibold text-brand underline underline-offset-2 hover:no-underline"
            >
              {feed.usingDefaults ? "Choose your competitions" : "Edit"}
            </Link>
          )}
        </div>

        <div className="mt-6">
          {feed.inYourLeagues.length === 0 ? (
            <EmptyState
              icon="◷"
              title="Nothing publishable in your leagues right now"
              description={
                "Either these competitions have no fixtures in the next few days, or their " +
                "history is too thin to publish a pick. Rather than filling the space with " +
                "matches you didn't ask for, we'd rather say so."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href={predictionsHref}>See every prediction</ButtonLink>
                  {feed.signedIn && (
                    <ButtonLink href="/account#preferences" variant="secondary">
                      Follow more competitions
                    </ButtonLink>
                  )}
                </div>
              }
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-start">
              <div className="space-y-4">
                {feed.inYourLeagues.slice(0, 6).map((pick) => (
                  <PickRow
                    key={pick.id}
                    pick={pick}
                    added={added === pick.id}
                    onAdd={() => addPick(pick)}
                    social={social}
                    signedIn={feed.signedIn}
                    live={live[pick.id]}
                  />
                ))}
                {feed.inYourLeagues.length > 6 && (
                  <div className="pt-1">
                    <ButtonLink href={predictionsHref} variant="secondary" className="px-4 py-2 text-xs">
                      {feed.inYourLeagues.length - 6} more in your leagues →
                    </ButtonLink>
                  </div>
                )}
              </div>

              <AccaCard
                acca={feed.acca}
                added={added === "acca"}
                onAdd={addAcca}
                predictionsHref={predictionsHref}
              />
            </div>
          )}
        </div>
      </section>

      {!feed.signedIn && <SignedOutBanner />}

      {(feed.bestBet || feed.quickPicks.length > 0) && (
        <section>
          <SectionHeading
            eyebrow="Across every competition"
            title="Today's stand-outs"
          />

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {feed.bestBet && (
              <div className="lg:col-span-3">
                <PickRow
                  pick={feed.bestBet}
                  added={added === feed.bestBet.id}
                  onAdd={() => addPick(feed.bestBet!)}
                  badge="Pick of the day"
                  featured
                  social={social}
                  signedIn={feed.signedIn}
                  live={live[feed.bestBet.id]}
                />
              </div>
            )}
            {feed.quickPicks.map((pick) => (
              <PickRow
                key={pick.id}
                pick={pick}
                added={added === pick.id}
                onAdd={() => addPick(pick)}
                social={social}
                signedIn={feed.signedIn}
                live={live[pick.id]}
              />
            ))}
          </div>
        </section>
      )}

    </Container>
  );
}

/* --------------------------------------------------------------- Pick row */

type Social = ReturnType<typeof useSocialCounts>;

/**
 * One pick, collapsed to who, what and how likely. Expanding it shows the
 * full-analysis link and the comment thread; love, comments and add-to-slip
 * stay on the collapsed card because they are what people do most.
 */
function PickRow({
  pick,
  added,
  onAdd,
  badge,
  featured = false,
  social,
  signedIn,
  live,
}: {
  pick: PersonalizedPick;
  added: boolean;
  onAdd: () => void;
  badge?: string;
  featured?: boolean;
  social: Social;
  signedIn: boolean;
  live?: LegScore;
}) {
  const [open, setOpen] = useState(false);
  const count = social.counts[pick.id];
  // A Pro pick shown to a free viewer: its selection never left the server.
  const locked = isLockedPick(pick);
  // Fresh poll first, then what the page was rendered with.
  const state: LegScore = live ?? {
    status: pick.status,
    minute: pick.minute ?? null,
    home: pick.score?.home ?? null,
    away: pick.score?.away ?? null,
  };
  // A feed stuck on "live" long after kickoff reads as full time (src/lib/match-status.ts).
  const stale = isStaleInPlay(state.status, pick.kickoff);
  const inPlay = !stale && (state.status === "live" || state.status === "halftime");
  const over = state.status === "finished" || stale;
  const showScore = (inPlay || over) && state.home !== null && state.away !== null;
  // Counts on between polls; the server-rendered minute isn't stamped, so it waits for the first.
  const minute = useTickingMinute(state.minute, state.status, live?.observedAt ?? Number.NaN);

  return (
    <article
      className={`card p-4 transition-colors hover:border-line-strong sm:p-5 ${
        featured ? "border-brand/30 bg-brand/[0.03]" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left"
      >
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          {badge && <Badge tone="brand">{badge}</Badge>}
          {isStrong(pick) && <StrongBadge />}
          <span aria-hidden>{pick.league.flag}</span>
          <span className="truncate">{pick.league.shortName}</span>
          <span aria-hidden>·</span>
          {inPlay ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose/12 px-2 py-0.5 text-[11px] font-bold text-rose">
              <LiveDot />
              {state.status === "halftime" ? "HT" : minute ? `LIVE ${minute}'` : "LIVE"}
            </span>
          ) : over ? (
            <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-bold text-ink-muted">FT</span>
          ) : (
            <span className="shrink-0">
              <LocalTime iso={pick.kickoff} kind="day" /> <LocalTime iso={pick.kickoff} />
            </span>
          )}
          <svg
            viewBox="0 0 20 20"
            className={`ml-auto size-4 shrink-0 text-ink-dim transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className={`mt-2.5 space-y-1.5 font-semibold ${featured ? "text-base" : "text-sm"}`}>
          <p className="flex min-w-0 items-center gap-2.5">
            <Crest src={pick.homeCrest} name={pick.homeTeam} size={22} />
            <span className="min-w-0 flex-1 truncate">{pick.homeTeam}</span>
            {showScore && <span className={`tnum shrink-0 font-bold ${inPlay ? "text-signal" : ""}`}>{state.home}</span>}
          </p>
          <p className="flex min-w-0 items-center gap-2.5">
            <Crest src={pick.awayCrest} name={pick.awayTeam} size={22} />
            <span className="min-w-0 flex-1 truncate">{pick.awayTeam}</span>
            {showScore && <span className={`tnum shrink-0 font-bold ${inPlay ? "text-signal" : ""}`}>{state.away}</span>}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-surface-2/60 px-3 py-2">
          {locked ? (
            <>
              <LockedSelection group={pick.group as Pick["group"]} className="text-sm font-semibold text-brand" />
              <ProTag />
            </>
          ) : (
            <>
              <span className="min-w-0 truncate text-sm font-semibold text-brand">{pick.label}</span>
              <span className="tnum shrink-0 text-sm font-bold">{percent(pick.probability, 1)}</span>
            </>
          )}
        </div>
      </button>

      <div className="mt-2 flex items-center gap-1">
        <LoveButton
          matchId={pick.id}
          count={count}
          signedIn={signedIn}
          onChange={(patch) => social.update(pick.id, patch)}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Comments"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3h0A1.5 1.5 0 0 1 4 11.5v-6Z" strokeLinejoin="round" />
          </svg>
          <span className="tnum">{count?.comments ? count.comments : ""}</span>
        </button>
        {locked ? (
          <ButtonLink href="/account/billing?plan=pro" variant="secondary" className="ml-auto px-3.5 py-1.5 text-xs">
            Unlock
          </ButtonLink>
        ) : (
          <Button
            onClick={onAdd}
            variant={added ? "secondary" : "primary"}
            className="ml-auto px-3.5 py-1.5 text-xs"
          >
            {added ? "✓ On slip" : "+ Slip"}
          </Button>
        )}
      </div>

      {open && (
        <>
          <Link
            href={pick.href}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            Full analysis →
          </Link>
          <CommentThread
            matchId={pick.id}
            signedIn={signedIn}
            onCountChange={(d) => social.update(pick.id, (c) => ({ ...c, comments: Math.max(0, c.comments + d) }))}
          />
        </>
      )}
    </article>
  );
}

/* ------------------------------------------------------------- Acca card */

function AccaCard({
  acca,
  added,
  onAdd,
  predictionsHref,
}: {
  acca: AccaSuggestion | null;
  added: boolean;
  onAdd: (acca: AccaSuggestion) => void;
  predictionsHref: string;
}) {
  if (!acca) {
    return (
      <div className="card p-6">
        <h3 className="text-sm font-semibold">Suggested multiple</h3>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          There aren&apos;t enough publishable picks in your competitions to build one today. We
          won&apos;t pad it out with fixtures you didn&apos;t ask for.
        </p>
        <div className="mt-4">
          <ButtonLink href={predictionsHref} variant="secondary" className="px-4 py-2 text-xs">
            Browse every prediction
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-6">
      <div>
        <h3 className="text-sm font-semibold">
          Suggested {acca.legs.length}-leg multiple
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          The highest-confidence picks from your competitions.
        </p>
      </div>

      <ul className="space-y-3 border-y border-line py-4">
        {acca.legs.map((leg) => (
          <li key={leg.matchId} className="flex items-start justify-between gap-3 text-xs">
            <div className="min-w-0">
              <Link
                href={leg.href}
                className="-mx-1 inline-block rounded px-1 py-1 font-semibold text-ink transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {leg.fixture}
              </Link>
              <p className="text-ink-muted">
                {leg.group}: <span className="font-medium text-brand">{leg.selection}</span>
              </p>
            </div>
            <span className="tnum shrink-0 rounded border border-line bg-surface-2 px-2 py-0.5 font-mono font-semibold">
              {percent(leg.probability)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            Combined probability
          </p>
          <p className="tnum font-mono tracking-tight text-xl font-medium text-brand">
            {percent(acca.combinedProbability, 1)}
          </p>
        </div>
      </div>


      <Button
        onClick={() => onAdd(acca)}
        variant={added ? "secondary" : "primary"}
        className="w-full py-2.5"
      >
        {added ? "✓ Added to slip" : `Add all ${acca.legs.length} to slip`}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------- Signed-out band */

/**
 * The logged-out pitch.
 *
 * Deliberately carries no statistics. The version this replaces advertised
 * "78.4% 30D Win Rate" and "+14.2% Avg ROI" — neither of which came from
 * anywhere. The real settled record is one click away on the track record
 * page, where it is computed from predictions_log and can be checked.
 */
function SignedOutBanner() {
  return (
    <div className="card border-brand/30 bg-brand/[0.04] p-6 md:p-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="max-w-2xl space-y-2">
          <Badge tone="brand">Free account</Badge>
          <h2 className="font-display text-xl font-bold tracking-tight md:text-2xl">
            Tell us which competitions you follow
          </h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            This page is showing our default set. With a free account it shows only the leagues
            you pick and keeps your selection slip across devices.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <ButtonLink href="/account/sign-up" className="px-6 py-3">
            Create free account
          </ButtonLink>
          <ButtonLink href="/account/login" variant="secondary" className="px-5 py-3">
            Sign in
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
