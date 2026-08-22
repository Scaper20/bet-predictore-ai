"use client";

import { useEffect, useState } from "react";

interface Message {
  id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
}

/** Polls for new messages while an admin has a ticket open — same
 * visibility-aware recursive-setTimeout shape as live-board.tsx. */
export function TicketThread({ ticketId, initialMessages }: { ticketId: string; initialMessages: Message[] }) {
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/tickets/${ticketId}/messages`, { cache: "no-store" });
        if (res.ok) {
          const data: { messages: Message[] } = await res.json();
          if (!cancelled) setMessages(data.messages);
        }
      } catch {
        // Keep showing the last good thread; a blip should not blank it.
      } finally {
        if (!cancelled) timer = setTimeout(tick, document.hidden ? 60_000 : 8_000);
      }
    };

    timer = setTimeout(tick, 8_000);
    const onVisible = () => {
      if (!document.hidden) {
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
  }, [ticketId]);

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
            m.sender_role === "admin" ? "ml-auto bg-brand/12 text-ink" : "bg-surface-2 text-ink"
          }`}
        >
          <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
          <p className="mt-1 text-[10px] text-ink-dim">
            {new Date(m.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      ))}
    </div>
  );
}
