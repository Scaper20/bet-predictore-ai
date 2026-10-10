"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { closeAsk, takeQueued, useAskState } from "@/lib/ask-store";
import { useSlip } from "@/lib/slip";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { LocalTime } from "@/components/ui/local-time";
import type { AskEvent, AskPickCard, AskTurn } from "@/lib/ask/request";
import { ASK_FREE_DAILY, ASK_GUEST_TOTAL, ASK_MAX_QUESTION } from "@/lib/ask/request";
import { AskAvatar } from "@/components/ask/ask-avatar";

/* ------------------------------------------------------------------ types */

type Part = { type: "text"; text: string } | { type: "picks"; picks: AskPickCard[] };

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  /** What the question was about, shown as a chip on the user's bubble. */
  about?: string;
  status?: string;
  error?: { message: string; code?: string };
  pending?: boolean;
}

interface Allowance {
  enabled: boolean;
  signedIn: boolean;
  paid: boolean;
  used: number | null;
  limit: number | null;
}

const STORE_KEY = "betrix.ask.v1";
const MAX_STORED = 30;

const uid = () => Math.random().toString(36).slice(2, 10);

function loadHistory(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ChatMessage[]).filter((m) => !m.pending) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(messages.filter((m) => !m.pending).slice(-MAX_STORED)));
  } catch {
    // Private mode or full storage: the chat just won't survive a reload.
  }
}

/** What the model sees of earlier turns: the text, plus which cards it showed. */
function toTurns(messages: ChatMessage[]): AskTurn[] {
  return messages
    .filter((m) => !m.error && !m.pending)
    .map((m) => ({
      role: m.role,
      text: m.parts
        .map((p) =>
          p.type === "text"
            ? p.text
            : `[Showed picks: ${p.picks.map((c) => `${c.fixture} — ${c.label} (${c.matchId}, ${c.market})`).join("; ")}]`,
        )
        .join("\n")
        .trim(),
    }))
    .filter((t) => t.text);
}

const pct = (p: number) => `${Number((p * 100).toFixed(p >= 0.995 ? 1 : 0))}%`;

/* ----------------------------------------------------------------- panel */

export function AskPanel() {
  const { open, page } = useAskState();
  if (!open) return null;
  return <AskPanelInner page={page} />;
}

function AskPanelInner({ page }: { page: { matchId: string; label: string } | null }) {
  const pathname = usePathname();
  const { entitlement } = useEntitlement();
  const { legs } = useSlip();
  const onSlipPage = /^\/[a-z]+\/slip\/?$/.test(pathname);
  const onMatchPage = Boolean(page) && pathname.includes("/match/");

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [useContextPage, setUseContextPage] = useState(true);
  /** A signed-out visitor has used their free questions: the sign-up overlay is up. */
  const [guestGated, setGuestGated] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  const matchContext = onMatchPage && useContextPage ? page : null;
  const slipContext = onSlipPage && useContextPage && legs.length > 0 ? legs : null;

  useEffect(() => saveHistory(messages), [messages]);

  useEffect(() => {
    fetch("/api/ask", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: Allowance | null) => a && setAllowance(a))
      .catch(() => {});
  }, []);

  // Keep the newest message in view as it streams.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Escape closes; the page behind stops scrolling only where the panel covers it (phones).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAsk();
    };
    document.addEventListener("keydown", onKey);
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    const previous = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    input.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      if (mobile) document.body.style.overflow = previous;
      abort.current?.abort();
    };
  }, []);

  const signedIn = allowance?.signedIn ?? entitlement.signedIn;
  const enabled = allowance?.enabled ?? true;
  const remaining = allowance && allowance.limit !== null && allowance.used !== null ? Math.max(0, allowance.limit - allowance.used) : null;
  /** Signed-in accounts that are out for today; guests get the overlay instead. */
  const outOfQuestions = signedIn && remaining === 0;
  const guestOut = !signedIn && remaining === 0;

  const patchLast = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev];
      const i = next.length - 1;
      if (i >= 0 && next[i].role === "assistant") next[i] = fn(next[i]);
      return next;
    });
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim().slice(0, ASK_MAX_QUESTION);
      if (!question || busy) return;
      if (guestOut) {
        setDraft(question);
        setGuestGated(true);
        return;
      }
      setDraft("");
      setBusy(true);

      const about = matchContext?.label ?? (slipContext ? `Your slip · ${slipContext.length} legs` : undefined);
      const userMsg: ChatMessage = { id: uid(), role: "user", parts: [{ type: "text", text: question }], about };
      const reply: ChatMessage = { id: uid(), role: "assistant", parts: [], pending: true, status: "Thinking…" };
      const history = [...messages, userMsg];
      setMessages([...history, reply]);

      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            turns: toTurns(history),
            context: {
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...(matchContext ? { matchId: matchContext.matchId, matchLabel: matchContext.label } : {}),
              ...(slipContext
                ? {
                    slip: slipContext.map((l) => ({
                      matchId: l.matchId,
                      fixture: l.fixture,
                      market: l.market,
                      label: l.label,
                      probability: l.probability,
                      fairOdds: l.fairOdds,
                      bookmakerOdds: l.bookmakerOdds,
                    })),
                  }
                : {}),
            },
          }),
        });

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as Extract<AskEvent, { type: "error" }> | null;
          if (body?.code === "guest_limit" || body?.code === "sign_in") {
            // The overlay explains it; drop the empty reply and keep the question for after sign-up.
            setGuestGated(true);
            setAllowance((a) => (a ? { ...a, used: a.limit } : a));
            setMessages((prev) => prev.filter((m) => m.id !== reply.id && m.id !== userMsg.id));
            setDraft(question);
            return;
          }
          patchLast((m) => ({
            ...m,
            pending: false,
            status: undefined,
            error: { message: body?.message ?? "Something went wrong. Try again.", code: body?.code },
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let event: AskEvent;
            try {
              event = JSON.parse(line) as AskEvent;
            } catch {
              continue;
            }
            applyEvent(event);
          }
        }
        patchLast((m) => ({ ...m, pending: false, status: undefined }));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        patchLast((m) => ({
          ...m,
          pending: false,
          status: undefined,
          error: { message: "Connection lost. Check your network and try again." },
        }));
      } finally {
        setBusy(false);
        abort.current = null;
      }

      function applyEvent(event: AskEvent) {
        switch (event.type) {
          case "text":
            patchLast((m) => {
              const parts = [...m.parts];
              const last = parts[parts.length - 1];
              if (last?.type === "text") parts[parts.length - 1] = { type: "text", text: last.text + event.delta };
              else parts.push({ type: "text", text: event.delta });
              return { ...m, parts, status: undefined };
            });
            break;
          case "status":
            patchLast((m) => ({ ...m, status: event.label }));
            break;
          case "picks":
            patchLast((m) => ({ ...m, parts: [...m.parts, { type: "picks", picks: event.picks }] }));
            break;
          case "done":
            setAllowance((a) => (a ? { ...a, used: event.used, limit: event.limit } : a));
            break;
          case "error":
            patchLast((m) => ({ ...m, pending: false, status: undefined, error: { message: event.message, code: event.code } }));
            break;
        }
      }
    },
    [busy, guestOut, messages, matchContext, slipContext, patchLast],
  );

  // A question queued by a button elsewhere on the page.
  // Read on the next tick, not in the effect body, so opening the panel and
  // sending the question are two renders rather than one cascading update.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = takeQueued();
      if (!q) return;
      if (q.send) void ask(q.text);
      else {
        setDraft(q.text);
        input.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(t);
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => {
    if (matchContext) return ["Best pick for this game", "Is over 2.5 worth it?", "Compare their form", "Explain this prediction"];
    if (slipContext) return ["Check my slip", "Which leg is weakest?", "Is my slip good value?", "Make it safer"];
    return ["Safest picks today", "Best value tonight", "3-leg acca for the weekend", "What's live right now?"];
  }, [matchContext, slipContext]);

  // A signed-out visitor who has used their questions sees the overlay when
  // they try another — not the moment their last answer finishes.
  const showGuestGate = enabled && !signedIn && guestGated;
  const subtitle = matchContext
    ? `Knows this page: ${matchContext.label}`
    : slipContext
      ? `Knows your slip · ${slipContext.length} ${slipContext.length === 1 ? "leg" : "legs"}`
      : "Answers from the model only";

  return (
    <div
      role="dialog"
      aria-label="Ask KiqStat"
      className="fixed inset-0 z-[60] flex flex-col bg-canvas lg:inset-auto lg:bottom-0 lg:right-0 lg:top-[var(--header-h)] lg:z-40 lg:w-[27rem] lg:border-l lg:border-line lg:bg-shell lg:shadow-[-24px_0_60px_-30px_rgb(0_0_0/0.9)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <AskAvatar size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold leading-tight">
            Ask KiqStat
          </p>
          <p className="truncate text-xs text-ink-muted">{subtitle}</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              abort.current?.abort();
              setMessages([]);
              setBusy(false);
            }}
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            New chat
          </button>
        )}
        <button
          type="button"
          onClick={closeAsk}
          aria-label="Close Ask KiqStat"
          className="grid size-10 place-items-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
      {/* conversation */}
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        {(matchContext || slipContext) && (
          <div className="flex">
            <span className="inline-flex max-w-full items-center gap-2 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand">
              <span className="truncate">About: {matchContext?.label ?? `your slip (${slipContext?.length} legs)`}</span>
              <button
                type="button"
                onClick={() => setUseContextPage(false)}
                aria-label="Don't use this page"
                className="shrink-0 text-brand/70 hover:text-brand"
              >
                ✕
              </button>
            </span>
          </div>
        )}

        {messages.length === 0 && <EmptyIntro context={Boolean(matchContext || slipContext)} />}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-dim/60 px-4 py-2.5 text-sm leading-relaxed text-ink">
                {m.parts.map((p, i) => (p.type === "text" ? <Fragment key={i}>{p.text}</Fragment> : null))}
              </div>
            </div>
          ) : (
            <AssistantBubble key={m.id} message={m} />
          ),
        )}
      </div>

      {/* composer */}
      <div className="border-t border-line px-4 pb-3 pt-3 sm:px-5" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {!enabled ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
            Ask KiqStat isn&apos;t available right now. Check back soon.
          </p>
        ) : (
          <>
            {!busy && !outOfQuestions && !guestOut && (
              <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(draft);
              }}
              className="flex items-end gap-2.5"
            >
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
                rows={1}
                maxLength={ASK_MAX_QUESTION}
                disabled={outOfQuestions}
                placeholder={outOfQuestions ? "No questions left today" : guestOut ? "Create a free account to keep asking" : "Ask about any match…"}
                className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50 disabled:opacity-60"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => abort.current?.abort()}
                  aria-label="Stop"
                  className="grid size-12 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 text-ink transition-colors hover:bg-surface-3"
                >
                  <span className="size-3.5 rounded-sm bg-ink" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!draft.trim() || outOfQuestions}
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-40"
                >
                  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M4 10h11M11 5.5 15.5 10 11 14.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </form>
            <p className="mt-2 text-center text-[11px] text-ink-dim">
              {allowance?.paid ? (
                "Unlimited with your plan · Never invents injuries or news"
              ) : !signedIn ? (
                <>
                  {remaining !== null
                    ? `${remaining} of ${ASK_GUEST_TOTAL} free questions left`
                    : `${ASK_GUEST_TOTAL} free questions, no account needed`}
                  {" · "}
                  <Link href={`/account/sign-up?next=${encodeURIComponent(pathname)}`} onClick={closeAsk} className="underline-offset-2 hover:text-ink hover:underline">
                    Sign up free for {ASK_FREE_DAILY} a day
                  </Link>
                </>
              ) : (
                <>
                  {remaining !== null ? `${remaining} of ${ASK_FREE_DAILY} free questions left today` : `Free: ${ASK_FREE_DAILY} questions a day`}
                  {" · "}
                  <Link href="/pricing" className="underline-offset-2 hover:text-ink hover:underline">
                    Pro: unlimited
                  </Link>
                </>
              )}
            </p>
          </>
        )}
      </div>

      {showGuestGate && <GuestGate pathname={pathname} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function EmptyIntro({ context }: { context: boolean }) {
  return (
    <div className="px-1 pb-2 pt-6 text-center">
      <div className="mx-auto w-fit">
        <AskAvatar size="lg" />
      </div>
      <p className="mt-4 font-display text-2xl font-bold">
        {context ? "Ask about this, or anything" : "Ask about any match"}
      </p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
        Picks, prices, form, accas. Every answer comes from the KiqStat model and live SportyBet prices, and you can add
        what it suggests straight to your slip.
      </p>
      <p className="mx-auto mt-3 max-w-xs text-[11px] text-ink-dim">
        It never invents injuries, line-ups or news. Probabilities, not promises. 18+.
      </p>
    </div>
  );
}

/** Blurs the chat once a signed-out visitor has used their free questions. */
function GuestGate({ pathname }: { pathname: string }) {
  const next = encodeURIComponent(pathname);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas/55 p-5 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-shell/95 p-6 text-center shadow-2xl">
        <div className="mx-auto w-fit">
          <AskAvatar size="lg" />
        </div>
        <p className="mt-4 font-display text-2xl font-bold">Keep asking KiqStat</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          You&apos;ve used your {ASK_GUEST_TOTAL} free questions. Create a free account to get {ASK_FREE_DAILY} questions
          a day. Your chat stays right here.
        </p>
        <div className="mt-5 space-y-2.5">
          <Link
            href={`/account/sign-up?next=${next}`}
            onClick={closeAsk}
            className="block rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
          >
            Create free account
          </Link>
          <Link
            href={`/account/login?next=${next}`}
            onClick={closeAsk}
            className="block rounded-lg border border-line px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-line-strong"
          >
            I already have an account
          </Link>
        </div>
        <p className="mt-4 text-[11px] text-ink-dim">Takes a minute. Pro: unlimited questions.</p>
      </div>
    </div>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const empty = message.parts.length === 0;
  return (
    <div className="flex">
      <div className="w-full space-y-3 rounded-2xl rounded-bl-md bg-surface px-4 py-3 sm:w-auto sm:max-w-[92%] text-sm leading-relaxed text-ink">
        {message.parts.map((p, i) =>
          p.type === "text" ? <RichText key={i} text={p.text} /> : <PickCards key={i} picks={p.picks} />,
        )}
        {message.pending && message.status && (
          <p className={`flex items-center gap-2 text-xs text-ink-muted ${empty ? "" : "pt-1"}`}>
            <span className="flex gap-1" aria-hidden>
              <span className="size-1.5 animate-pulse rounded-full bg-brand" />
              <span className="size-1.5 animate-pulse rounded-full bg-brand [animation-delay:150ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-brand [animation-delay:300ms]" />
            </span>
            {message.status}
          </p>
        )}
        {message.error && <ErrorNote error={message.error} />}
      </div>
    </div>
  );
}

function ErrorNote({ error }: { error: { message: string; code?: string } }) {
  return (
    <div className="text-xs text-ink-muted">
      <p className="text-rose">{error.message}</p>
      {error.code === "limit" && (
        <Link href="/pricing" onClick={closeAsk} className="mt-1.5 inline-block font-semibold text-brand hover:underline">
          See plans
        </Link>
      )}
      {error.code === "sign_in" && (
        <Link href="/account/sign-up" onClick={closeAsk} className="mt-1.5 inline-block font-semibold text-brand hover:underline">
          Create free account
        </Link>
      )}
    </div>
  );
}

/** **bold**, paragraphs and "- " bullets — all the assistant is told to use. */
function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} className="space-y-1 pl-4">
              {lines.map((l, j) => (
                <li key={j} className="list-disc marker:text-ink-dim">
                  {inline(l.replace(/^\s*[-•]\s+/, ""))}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") && seg.length > 4 ? (
      <strong key={i} className="font-semibold text-ink">
        {seg.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{seg}</Fragment>
    ),
  );
}

function PickCards({ picks }: { picks: AskPickCard[] }) {
  const { legs, add } = useSlip();
  const onSlip = (c: AskPickCard) => legs.some((l) => l.matchId === c.matchId && l.market === c.market);
  const addCard = (c: AskPickCard) =>
    add({
      matchId: c.matchId,
      fixture: c.fixture,
      homeName: c.homeName,
      awayName: c.awayName,
      league: c.league,
      kickoff: c.kickoff,
      market: c.market,
      label: c.label,
      probability: c.probability,
      fairOdds: c.fairOdds,
      ...(c.price ? { bookmakerOdds: c.price, oddsSource: "sportybet" as const } : {}),
    });

  const combinedP = picks.reduce((p, c) => p * c.probability, 1);
  const combinedOdds = picks.reduce((o, c) => o * (c.price ?? c.fairOdds), 1);
  const allAdded = picks.every(onSlip);

  return (
    <div className="space-y-2">
      {picks.map((c) => {
        const added = onSlip(c);
        return (
          <div key={`${c.matchId}|${c.market}`} className="flex items-center gap-3 rounded-xl border border-line bg-canvas/40 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{c.fixture}</p>
              <p className="truncate text-xs text-ink-muted">
                {c.label} · {pct(c.probability)}
              </p>
              <p className="truncate text-[10.5px] text-ink-dim">
                {c.league} · <LocalTime iso={c.kickoff} kind="day" />, <LocalTime iso={c.kickoff} />
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tnum font-mono text-sm font-bold text-ink">{(c.price ?? c.fairOdds).toFixed(2)}</p>
              <p className="text-[9.5px] uppercase tracking-wider text-ink-dim">{c.price ? "SportyBet" : "Fair"}</p>
            </div>
            <button
              type="button"
              onClick={() => addCard(c)}
              disabled={added}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                added ? "border-brand/30 bg-brand/10 text-brand" : "border-line-strong text-ink hover:border-brand/50 hover:text-brand"
              }`}
            >
              {added ? "✓ Added" : "+ Slip"}
            </button>
          </div>
        );
      })}
      {picks.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <p className="text-xs text-ink-muted">
            Together: odds <span className="tnum font-semibold text-ink">{combinedOdds.toFixed(2)}</span>, about{" "}
            <span className="tnum font-semibold text-ink">{pct(combinedP)}</span> chance.
          </p>
          <button
            type="button"
            disabled={allAdded}
            onClick={() => picks.filter((c) => !onSlip(c)).forEach(addCard)}
            className="text-xs font-semibold text-brand disabled:text-ink-dim"
          >
            {allAdded ? "All on your slip" : "Add all to slip"}
          </button>
        </div>
      )}
    </div>
  );
}
