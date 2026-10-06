"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SocialCount {
  loves: number;
  comments: number;
  loved: boolean;
}

/** Love and comment counts for every pick on the page, in one request. */
export function useSocialCounts(ids: string[]) {
  const key = [...new Set(ids)].sort().join(",");
  const [counts, setCounts] = useState<Record<string, SocialCount>>({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/social?ids=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCounts(d.counts ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback((id: string, patch: (c: SocialCount) => SocialCount) => {
    setCounts((all) => ({ ...all, [id]: patch(all[id] ?? { loves: 0, comments: 0, loved: false }) }));
  }, []);

  return { counts, update };
}

export function LoveButton({
  matchId,
  count,
  signedIn,
  onChange,
}: {
  matchId: string;
  count: SocialCount | undefined;
  signedIn: boolean;
  onChange: (patch: (c: SocialCount) => SocialCount) => void;
}) {
  const pathname = usePathname();
  const loved = count?.loved ?? false;
  const loves = count?.loves ?? 0;

  async function toggle() {
    const next = !loved;
    // Optimistic: the heart responds at once; a failed save puts it back.
    onChange((c) => ({ ...c, loved: next, loves: Math.max(0, c.loves + (next ? 1 : -1)) }));
    const res = await fetch("/api/social/love", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, loved: next }),
    }).catch(() => null);
    if (!res?.ok) onChange((c) => ({ ...c, loved: !next, loves: Math.max(0, c.loves + (next ? -1 : 1)) }));
  }

  const className = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors ${
    loved ? "bg-rose/12 text-rose" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
  }`;
  const inner = (
    <>
      <svg viewBox="0 0 20 20" className="size-4" fill={loved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M10 17s-6-3.6-6-8.2A3.4 3.4 0 0 1 10 6.4a3.4 3.4 0 0 1 6 2.4C16 13.4 10 17 10 17Z" strokeLinejoin="round" />
      </svg>
      <span className="tnum">{loves > 0 ? loves : ""}</span>
    </>
  );

  if (!signedIn) {
    return (
      <Link href={`/account/login?next=${encodeURIComponent(pathname)}`} className={className} aria-label="Sign in to love this pick">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={loved} aria-label={loved ? "Unlove this pick" : "Love this pick"} className={className}>
      {inner}
    </button>
  );
}

interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  mine: boolean;
  /** The top-level comment this replies to; null for a top-level comment. */
  parentId: string | null;
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** The comment thread under one pick. Loaded when it is first opened. */
export function CommentThread({
  matchId,
  signedIn,
  onCountChange,
}: {
  matchId: string;
  signedIn: boolean;
  onCountChange: (delta: number) => void;
}) {
  const pathname = usePathname();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startReply(c: Comment) {
    setReplyTo({ id: c.id, author: c.author });
    // A reply to a reply joins the thread; naming them keeps it clear who is answered.
    if (c.parentId) setDraft(`@${c.author} `);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const fetchComments = useCallback(
    () =>
      fetch(`/api/social/comments?matchId=${encodeURIComponent(matchId)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => (d.comments ?? []) as Comment[])
        .catch(() => [] as Comment[]),
    [matchId],
  );
  const load = useCallback(async () => setComments(await fetchComments()), [fetchComments]);

  useEffect(() => {
    let cancelled = false;
    fetchComments().then((c) => {
      if (!cancelled) setComments(c);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchComments]);

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/social/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, body, parentId: replyTo?.id }),
    }).catch(() => null);
    if (res?.ok) {
      setDraft("");
      setReplyTo(null);
      onCountChange(1);
      await load();
    } else {
      const data = res ? await res.json().catch(() => null) : null;
      setError(data?.error ?? "Couldn't post that. Try again.");
    }
    setSending(false);
  }

  async function remove(id: string) {
    // Deleting a comment takes its replies with it (0043, on delete cascade).
    const gone = (comments ?? []).filter((x) => x.id === id || x.parentId === id).length;
    setComments((c) => c?.filter((x) => x.id !== id && x.parentId !== id) ?? null);
    onCountChange(-gone);
    await fetch(`/api/social/comments?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {comments === null ? (
        <p className="text-xs text-ink-dim">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-ink-dim">No comments yet. Start it off.</p>
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto">
          {comments
            .filter((c) => !c.parentId)
            .map((c) => (
              <li key={c.id} className="space-y-2.5">
                <CommentRow comment={c} canReply={signedIn} onReply={startReply} onDelete={remove} />
                {comments.some((r) => r.parentId === c.id) && (
                  <ul className="ml-9 space-y-2.5 border-l border-line pl-3">
                    {comments
                      .filter((r) => r.parentId === c.id)
                      .map((r) => (
                        <li key={r.id}>
                          <CommentRow comment={r} canReply={signedIn} onReply={startReply} onDelete={remove} small />
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
        </ul>
      )}

      {signedIn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
          className="space-y-1.5"
        >
          {replyTo && (
            <p className="flex items-center justify-between gap-2 text-[11px] text-ink-dim">
              <span>
                Replying to <span className="font-semibold text-ink-muted">{replyTo.author}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null);
                  setDraft("");
                }}
                className="hover:text-ink"
              >
                Cancel
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder={replyTo ? `Reply to ${replyTo.author}…` : "Add a comment…"}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/50"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-brand-ink disabled:opacity-50"
            >
              {replyTo ? "Reply" : "Post"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-ink-muted">
          <Link href={`/account/login?next=${encodeURIComponent(pathname)}`} className="font-semibold text-brand hover:underline">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}
      {error && <p className="text-xs text-rose">{error}</p>}
    </div>
  );
}

function CommentRow({
  comment: c,
  canReply,
  onReply,
  onDelete,
  small = false,
}: {
  comment: Comment;
  canReply: boolean;
  onReply: (c: Comment) => void;
  onDelete: (id: string) => void;
  small?: boolean;
}) {
  return (
    <div className="flex gap-2.5 text-sm">
      <span
        className={`grid shrink-0 place-items-center rounded-full bg-surface-3 font-bold text-ink-muted ${small ? "size-6 text-[10px]" : "size-7 text-[11px]"}`}
        aria-hidden
      >
        {c.author.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-semibold text-ink">{c.author}</span>
          <span className="ml-1.5 text-ink-dim">{ago(c.createdAt)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-ink-muted">{c.body}</p>
        <div className="mt-1 flex gap-3 text-[11px] font-semibold text-ink-dim">
          {canReply && (
            <button type="button" onClick={() => onReply(c)} className="hover:text-brand">
              Reply
            </button>
          )}
          {c.mine && (
            <button type="button" onClick={() => onDelete(c.id)} className="hover:text-rose">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
