"use client";

import { useEffect, useRef, useState } from "react";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Spinner } from "@/components/ui/primitives";
import { useEntitlement, meetsTier } from "@/components/entitlements/entitlement-provider";
import { useAskState } from "@/lib/ask-store";
import { OPEN_SUPPORT_EVENT } from "@/components/layout/nav-actions";

interface Message {
  id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
}

/**
 * What support is asked about most, as one-tap starters. Each one fills the
 * message box with an opening line so the user only has to add the detail.
 */
const TOPICS: { label: string; starter: string }[] = [
  { label: "Payment or plan", starter: "I have a problem with my payment or plan. My payment reference is " },
  { label: "A prediction", starter: "I have a question about a prediction: " },
  { label: "Account and sign-in", starter: "I need help with my account: " },
  { label: "Something's broken", starter: "Something isn't working. On this page: " },
];

type ThreadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; messages: Message[]; guest: boolean; guestEmail: string | null };

/**
 * Support chat. It used to sit behind a floating bubble; that corner now
 * belongs to the slip (components/slip/slip-sheet.tsx), so the chat opens
 * from "Chat with support" in the menu (OPEN_SUPPORT_EVENT). Lazy — unlike EntitlementProvider (which must
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
  const { entitlement } = useEntitlement();
  const vip = meetsTier(entitlement.tier, "vip");
  // Ask BetriX's panel covers this corner (and its send button) while open,
  // and Forge's action bar sits there on phones.
  const askOpen = useAskState().open || /\/forge\/?$/.test(pathname);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<ThreadState>({ status: "idle" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<"chat" | "feedback">("chat");
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  const [email, setEmail] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  // A guest with no conversation yet gives an email first, so Oma can reply.
  const needsEmail = thread.status === "ready" && thread.guest && !thread.guestEmail;

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
      // Signed-out visitors chat too; their thread is found by cookie.
      setThread({
        status: "ready",
        messages: data.messages ?? [],
        guest: !data.signedIn,
        guestEmail: data.email ?? null,
      });
    } catch {
      // Leave whatever was showing — a blip shouldn't blank the panel.
    }
  };

  // Opened from the menu. Refs keep the listener current without
  // re-subscribing on every render.
  const threadRef = useRef(thread);
  const loadRef = useRef(loadThread);
  useEffect(() => {
    threadRef.current = thread;
    loadRef.current = loadThread;
  });
  useEffect(() => {
    const onOpen = () => {
      if (threadRef.current.status === "idle") {
        setThread({ status: "loading" });
        void loadRef.current();
      }
      setOpen(true);
    };
    window.addEventListener(OPEN_SUPPORT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, onOpen);
  }, []);

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

  function pickTopic(starter: string) {
    setDraft(starter);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(starter.length, starter.length);
    });
  }

  async function send() {
    const body = draft.trim();
    if (!body) return;
    if (needsEmail && !email.trim()) {
      setSendError("Add your email so we can reply.");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/support/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, ...(needsEmail ? { email: email.trim() } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSendError(data?.error ?? "Couldn't send. Try again.");
        return;
      }
      setDraft("");
      await loadThread();
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;
  return (
    <div className={`fixed right-6 z-50 lift-above-bottom-nav ${askOpen ? "hidden" : ""}`}>
      {open && (
        <div className="mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-line bg-shell shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/15 font-display text-sm font-bold text-brand" aria-hidden>
                O
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  Oma
                  {vip && <Badge tone="violet">VIP priority</Badge>}
                </span>
                <span className="block text-[11px] text-ink-dim">BetriX support</span>
              </span>
            </span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView((v) => (v === "feedback" ? "chat" : "feedback"))}
                className="text-xs font-medium text-ink-muted hover:text-ink"
              >
                {view === "feedback" ? "Chat" : "Feedback"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="text-ink-dim hover:text-ink"
              >
                ✕
              </button>
            </span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
            <OmaBubble>
              Hi, I&apos;m Oma 👋 How can I help?
            </OmaBubble>

            {view === "feedback" ? (
              <FeedbackForm onDone={() => setView("chat")} />
            ) : (
              <>
                {thread.status === "loading" && <p className="text-xs text-ink-dim">Loading…</p>}

                {thread.status === "ready" &&
                  (thread.messages.length === 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {TOPICS.map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => pickTopic(t.starter)}
                          className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand/40 hover:text-brand"
                        >
                          {t.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setView("feedback")}
                        className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand/40 hover:text-brand"
                      >
                        Give feedback
                      </button>
                    </div>
                  ) : (
                    thread.messages.map((m) =>
                      m.sender_role === "admin" ? (
                        <OmaBubble key={m.id}>{m.body}</OmaBubble>
                      ) : (
                        <div key={m.id} className="ml-auto max-w-[85%] rounded-xl bg-brand/12 px-3.5 py-2 text-sm text-ink">
                          <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                        </div>
                      ),
                    )
                  ))}
              </>
            )}
          </div>

          {view === "chat" && thread.status === "ready" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="space-y-2 border-t border-line p-3"
            >
              {needsEmail && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="Your email, so we can reply"
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/50"
                />
              )}
              {sendError && <p className="text-xs text-rose">{sendError}</p>}
              <div className="flex gap-2">
              <input
                ref={inputRef}
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
              </div>
              {thread.guest && (
                <p className="text-[11px] text-ink-dim">
                  Have an account?{" "}
                  <Link href={`/account/login?next=${encodeURIComponent(pathname)}`} className="text-brand hover:underline">
                    Sign in
                  </Link>{" "}
                  to keep this on every device.
                </p>
              )}
            </form>
          )}
        </div>
      )}

    </div>
  );
}

function OmaBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-surface-2 px-3.5 py-2 text-sm text-ink">
      <p className="whitespace-pre-wrap leading-relaxed">{children}</p>
    </div>
  );
}
