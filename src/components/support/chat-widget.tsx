"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button, Spinner } from "@/components/ui/primitives";

interface Message {
  id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
}

type ThreadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "ready"; messages: Message[] };

/**
 * Floating support chat. Lazy — unlike EntitlementProvider (which must
 * resolve immediately because Gate needs the answer to render), nothing
 * else on the page depends on ticket state, so this only fetches on first
 * open, not on mount.
 *
 * Polling follows the same visibility-aware recursive-setTimeout shape as
 * live-board.tsx / live-win-probability-panel.tsx, with a third state those
 * don't need: no timer at all while the panel is closed.
 */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<ThreadState>({ status: "idle" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const openRef = useRef(open);

  // Kept in sync via an effect (a plain ref sync, not a setState — refs
  // don't trigger re-renders), so the polling loop below always reads the
  // latest `open` without needing it in its own dependency array.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const loadThread = async () => {
    try {
      const res = await fetch("/api/support/thread", { cache: "no-store" });
      const data = await res.json();
      if (!data.signedIn) setThread({ status: "signed-out" });
      else setThread({ status: "ready", messages: data.messages });
    } catch {
      // Leave whatever was showing — a blip shouldn't blank the panel.
    }
  };

  function handleToggle() {
    // Triggered from a click handler, not an effect — the very first open
    // kicks off the initial fetch here rather than as a synchronous
    // setState inside a useEffect body.
    if (!open && thread.status === "idle") {
      setThread({ status: "loading" });
      void loadThread();
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!cancelled && openRef.current) await loadThread();
      if (!cancelled && openRef.current) {
        timer = setTimeout(tick, document.hidden ? 25_000 : 6_000);
      }
    };
    timer = setTimeout(tick, document.hidden ? 25_000 : 6_000);
    const onVisible = () => {
      if (!document.hidden && openRef.current) {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    try {
      await fetch("/api/support/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      await loadThread();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-line bg-shell shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Support</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-ink-dim hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
            {thread.status === "loading" && <p className="text-xs text-ink-dim">Loading…</p>}

            {thread.status === "signed-out" && (
              <div className="text-sm text-ink-muted">
                <p>Sign in to chat with support.</p>
                <Link
                  href={`/account/login?next=${encodeURIComponent(pathname)}`}
                  className="mt-3 inline-block text-brand underline underline-offset-2"
                >
                  Sign in
                </Link>
              </div>
            )}

            {thread.status === "ready" &&
              (thread.messages.length === 0 ? (
                <p className="text-sm text-ink-dim">
                  Got a question or an issue? Send us a message below.
                </p>
              ) : (
                thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm ${
                      m.sender_role === "user" ? "ml-auto bg-brand/12 text-ink" : "bg-surface-2 text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  </div>
                ))
              ))}
          </div>

          {thread.status === "ready" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex gap-2 border-t border-line p-3"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
              <Button type="submit" disabled={sending || !draft.trim()} className="px-4 py-2 text-xs">
                {sending ? <Spinner className="size-3.5" /> : null}
                {sending ? "Sending…" : "Send"}
              </Button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="grid size-14 place-items-center rounded-full bg-brand text-brand-ink shadow-lg glow-brand transition-transform hover:scale-105"
      >
        <span className="text-2xl leading-none">{open ? "✕" : "💬"}</span>
      </button>
    </div>
  );
}
