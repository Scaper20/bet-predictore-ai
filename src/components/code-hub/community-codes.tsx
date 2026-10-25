"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Input, LiveDot, Spinner } from "@/components/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { odds, percent } from "@/lib/format";
import type { CommunityPost, PostProblem } from "@/lib/code-hub-posts-core";
import { POSTS_PER_DAY } from "@/lib/code-hub-posts-core";

const SHARE = (code: string) => `https://www.sportybet.com/ng/?shareCode=${encodeURIComponent(code)}`;

/** How SportyBet's price compares with the model's chance for the whole code. */
function priceBadge(fairness: number | null): { tone: "brand" | "neutral" | "rose"; label: string } | null {
  if (fairness === null) return null;
  if (fairness >= 1.05) return { tone: "brand", label: "Well priced" };
  if (fairness >= 0.85) return { tone: "neutral", label: "Fair price" };
  return { tone: "rose", label: "Short price" };
}

/**
 * Codes members posted, ranked by the model's read of them, and a box to post
 * your own. A post is a code only: we read the games from SportyBet.
 */
export function CommunityCodes({
  initial,
  inPlay,
  finished,
  signedIn,
}: {
  initial: CommunityPost[];
  inPlay: CommunityPost[];
  finished: CommunityPost[];
  signedIn: boolean;
}) {
  const [posts, setPosts] = useState(initial);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<number | null>(null);
  /** Games that kept the code from going up, and whether leaving them off would fix it. */
  const [problems, setProblems] = useState<{ list: PostProblem[]; canFix: boolean } | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [rebooked, setRebooked] = useState<{ from: string; to: string; left: number } | null>(null);

  const post = async (drop: string[] = []) => {
    setPending(true);
    setError(null);
    setNextAt(null);
    setRebooked(null);
    try {
      const response = await fetch("/api/code-hub/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...(drop.length ? { drop } : {}) }),
      });
      const body = (await response.json().catch(() => null)) as {
        post?: CommunityPost;
        error?: string;
        problems?: PostProblem[];
        canFix?: boolean;
        nextAt?: number;
        rebooked?: { from: string; left: PostProblem[] };
      } | null;
      if (!response.ok || !body?.post) {
        setError(body?.error ?? (response.status >= 500 ? "Something went wrong on our side. Try again shortly." : "Couldn't post that just now."));
        setProblems(body?.problems?.length ? { list: body.problems, canFix: !!body.canFix } : null);
        setNextAt(typeof body?.nextAt === "number" ? body.nextAt : null);
      } else {
        const p = body.post;
        setPosts((all) => [...all.filter((x) => x.id !== p.id), p].sort((a, b) => b.score - a.score));
        setPosted(p.id);
        setProblems(null);
        if (body.rebooked) setRebooked({ from: body.rebooked.from, to: p.code, left: body.rebooked.left.length });
        setCode("");
      }
    } catch {
      setError("No connection. Check your network and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="community-heading">
      <div>
        <h2 id="community-heading" className="sr-only">
          Codes from members, ranked by the model
        </h2>
        <p className="text-sm text-ink-muted">
          Post a SportyBet code and we read every game on it. Codes are ranked by the model&apos;s chance of landing and
          how fairly SportyBet prices them. Each poster&apos;s record is counted from their past codes.
        </p>
      </div>

      {signedIn ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
                // A different code: what was said about the last one no longer applies.
                setProblems(null);
                setError(null);
              }}
              placeholder="Your SportyBet code"
              aria-label="SportyBet code to post"
              className="font-mono tracking-[0.12em] sm:max-w-xs"
            />
            <Button onClick={() => post()} disabled={pending || code.length < 4} className="py-2.5">
              {pending && <Spinner className="size-3.5" />}
              Post my code
            </Button>
          </div>
          <p className="text-xs text-ink-dim">
            Up to {POSTS_PER_DAY} a day, 2 games or more, before the first kick-off.
          </p>
          {error && (
            <p className="text-sm text-rose" role="alert">
              {error}
              {nextAt !== null && (
                <>
                  {" "}
                  Your next post opens <LocalTime iso={new Date(nextAt).toISOString()} kind="dayTime" />.
                </>
              )}
            </p>
          )}
          {problems && (
            <div className="space-y-2 rounded-xl border border-amber/40 bg-amber/5 p-3">
              <ul className="space-y-1.5">
                {problems.list.map((g) => (
                  <li key={g.eventId} className="text-sm">
                    <span className="block break-words font-semibold">
                      {g.homeName ?? "?"} v {g.awayName ?? "?"}
                    </span>
                    <span className="block break-words text-xs text-ink-dim">
                      {g.label}
                      {g.kickoff !== null && (
                        <>
                          {" · "}
                          <LocalTime iso={new Date(g.kickoff).toISOString()} kind="dayTime" />
                        </>
                      )}
                    </span>
                    <span className="block text-xs text-amber">{g.why}</span>
                  </li>
                ))}
              </ul>
              {problems.canFix && (
                <Button variant="secondary" onClick={() => post(problems.list.map((g) => g.eventId))} disabled={pending} className="py-2">
                  {pending && <Spinner className="size-3.5" />}
                  Post without {problems.list.length === 1 ? "this game" : `these ${problems.list.length} games`}
                </Button>
              )}
            </div>
          )}
          {rebooked && (
            <p className="text-sm text-ink-muted">
              Posted as a new code, <span className="font-mono font-semibold text-ink">{rebooked.to}</span>: your picks from{" "}
              <span className="font-mono">{rebooked.from}</span> without the {rebooked.left === 1 ? "game" : `${rebooked.left} games`}{" "}
              that couldn&apos;t go up.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          <Link href="/account/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>{" "}
          to post your own code.
        </p>
      )}

      <div className="space-y-2">
        <SectionTitle title="Upcoming" count={posts.length} />
        {posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-5 text-sm text-ink-muted">
            No codes posted for upcoming games yet. Be the first.
          </p>
        ) : (
          <ol className="space-y-3">
            {posts.map((p, i) => (
              <PostCard key={p.id} post={p} rank={i + 1} highlight={p.id === posted} />
            ))}
          </ol>
        )}
      </div>

      {inPlay.length > 0 && (
        <div className="space-y-2">
          <SectionTitle title="In play" count={inPlay.length} live />
          <ol className="space-y-3">
            {inPlay.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </ol>
        </div>
      )}

      {finished.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <SectionTitle title="Finished" count={finished.length} extra={`${finished.filter((p) => p.result === "won").length} landed`} />
            <span aria-hidden className="text-ink-dim transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ol className="mt-2 space-y-3">
            {finished.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function PostCard({ post, rank, highlight = false }: { post: CommunityPost; rank?: number; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const price = priceBadge(post.fairness);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(post.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the code is on screen.
    }
  };
  // Decided codes carry their result down the left edge; everything else keeps a plain border.
  const edge = post.result === "won" ? "border-l-4 border-l-brand" : post.result === "lost" ? "border-l-4 border-l-rose" : "";
  return (
    <li className={`rounded-xl border p-3.5 sm:p-4 ${edge} ${highlight ? "border-brand/50 bg-brand/5" : "border-line bg-surface-2/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {rank !== undefined && <span className="tnum font-display text-xl font-bold leading-7 text-ink-dim">{rank}</span>}
          <div className="min-w-0">
            <p className="font-mono text-lg font-bold leading-7 tracking-[0.12em]">{post.code}</p>
            <p className="truncate text-xs text-ink-dim">
              {post.authorName} · {post.record.landed}–{post.record.missed} record
            </p>
            <p className="text-xs text-ink-dim">
              Starts <LocalTime iso={post.firstKickoff} kind="dayTime" />
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {post.result === "won" && <Badge tone="brand">Landed</Badge>}
          {post.result === "lost" && <Badge tone="rose">Missed</Badge>}
          {post.result === "void" && <Badge>Void</Badge>}
          {price && !post.result && <Badge tone={price.tone}>{price.label}</Badge>}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-surface/60 px-3 py-2">
        <Stat label="Games" value={String(post.games.length)} />
        <Stat label="Odds" value={post.odds === null ? "–" : odds(post.odds)} />
        <Stat
          label="Our chance"
          value={
            post.chance !== null
              ? percent(post.chance, post.chance < 0.1 ? 1 : 0)
              : post.games.some((g) => g.verdict === "locked")
                ? "With Pro"
                : `${post.readable}/${post.games.length} read`
          }
        />
      </dl>

      {/* SportyBet stops loading a code at its first kick-off: only upcoming codes get the buttons. */}
      {rank !== undefined && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className="press rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-ink hover:bg-brand-strong">
            {copied ? "Copied" : "Copy code"}
          </button>
          <a
            href={SHARE(post.code)}
            target="_blank"
            rel="noreferrer"
            className="press rounded-lg border border-line px-3 py-2 text-center text-xs font-semibold hover:bg-surface-2"
          >
            Open in SportyBet
          </a>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold text-brand hover:bg-brand/5"
      >
        {open ? "Hide games" : `See the ${post.games.length} games`}
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <ul className="mt-2 divide-y divide-line/60 border-t border-line">
          {post.games.map((g, i) => (
            <li key={`${g.matchId ?? i}-${g.market}`} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{g.label}</span>
                <span className="block truncate text-xs text-ink-dim">
                  {g.homeName} v {g.awayName}
                  {g.source === "estimate" ? " · our estimate" : g.source && g.source !== "model" ? " · SportyBet's read" : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {g.probability !== null && <span className="font-mono text-xs text-ink-muted">{percent(g.probability)}</span>}
                <Badge tone={g.verdict === "strong" ? "brand" : g.verdict === "risky" ? "rose" : g.verdict === "unreadable" ? "amber" : "neutral"}>
                  {g.verdict === "unreadable" ? "Can't read" : g.verdict === "locked" ? "Pro" : g.verdict[0].toUpperCase() + g.verdict.slice(1)}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SectionTitle({ title, count, live = false, extra }: { title: string; count: number; live?: boolean; extra?: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
      {live && <LiveDot />}
      {title}
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-muted">{count}</span>
      {extra && <span className="text-xs font-normal text-ink-dim">{extra}</span>}
    </h3>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className="tnum mt-0.5 font-bold">{value}</dd>
    </div>
  );
}
