"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Input, Spinner } from "@/components/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { odds, percent } from "@/lib/format";
import type { CommunityPost } from "@/lib/code-hub-posts-core";
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
  recent,
  signedIn,
}: {
  initial: CommunityPost[];
  recent: CommunityPost[];
  signedIn: boolean;
}) {
  const [posts, setPosts] = useState(initial);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<number | null>(null);

  const post = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/code-hub/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.post) {
        setError(body?.error ?? "Couldn't post that just now.");
      } else {
        const p = body.post as CommunityPost;
        setPosts((all) => [...all.filter((x) => x.id !== p.id), p].sort((a, b) => b.score - a.score));
        setPosted(p.id);
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
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
              placeholder="Your SportyBet code"
              aria-label="SportyBet code to post"
              className="font-mono tracking-[0.12em] sm:max-w-xs"
            />
            <Button onClick={post} disabled={pending || code.length < 4} className="py-2.5">
              {pending && <Spinner className="size-3.5" />}
              Post my code
            </Button>
          </div>
          <p className="text-xs text-ink-dim">
            Up to {POSTS_PER_DAY} a day, 2 games or more, before the first kick-off.
          </p>
          {error && <p className="text-sm text-rose">{error}</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          <Link href="/account/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>{" "}
          to post your own code.
        </p>
      )}

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

      {recent.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">In play and just finished ({recent.length})</summary>
          <ol className="mt-3 space-y-3">
            {recent.map((p) => (
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
  return (
    <li className={`rounded-xl border p-4 ${highlight ? "border-brand/50 bg-brand/5" : "border-line bg-surface-2/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {rank !== undefined && <span className="tnum font-display text-2xl font-bold text-ink-dim">{rank}</span>}
          <div className="min-w-0">
            <p className="font-mono text-lg font-bold tracking-[0.12em]">{post.code}</p>
            <p className="text-xs text-ink-dim">
              {post.authorName} · {post.record.landed} landed, {post.record.missed} missed
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {post.result === "won" && <Badge tone="brand">Landed</Badge>}
          {post.result === "lost" && <Badge tone="rose">Missed</Badge>}
          {post.result === "void" && <Badge>Void</Badge>}
          {price && !post.result && <Badge tone={price.tone}>{price.label}</Badge>}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Games" value={String(post.games.length)} />
        <Stat label="SportyBet odds" value={post.odds === null ? "–" : odds(post.odds)} />
        <Stat
          label="Our chance"
          value={
            post.chance !== null
              ? percent(post.chance, post.chance < 0.1 ? 1 : 0)
              : post.games.some((g) => g.verdict === "locked")
                ? "With Pro"
                : `${post.readable} of ${post.games.length} read`
          }
        />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="press rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-ink hover:bg-brand-strong">
          {copied ? "Copied" : "Copy code"}
        </button>
        <a
          href={SHARE(post.code)}
          target="_blank"
          rel="noreferrer"
          className="press rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
        >
          Open in SportyBet
        </a>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand hover:underline">
          {open ? "Hide games" : "See games"}
        </button>
        <span className="ml-auto text-xs text-ink-dim">
          Starts <LocalTime iso={post.firstKickoff} kind="dayTime" />
        </span>
      </div>

      {open && (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {post.games.map((g, i) => (
            <li key={`${g.matchId ?? i}-${g.market}`} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{g.label}</span>
                <span className="block truncate text-xs text-ink-dim">
                  {g.homeName} v {g.awayName}
                  {g.source && g.source !== "model" ? " · SportyBet's read" : ""}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className="tnum mt-0.5 font-bold">{value}</dd>
    </div>
  );
}
