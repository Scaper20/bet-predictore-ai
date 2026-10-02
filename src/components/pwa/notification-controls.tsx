"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { Button } from "@/components/ui/primitives";
import type { PushTopics } from "@/lib/push/subscription";
import { OPEN_INSTALL_EVENT } from "./install";
import { disablePush, enablePush, loadTopics, pushState, sendTestPush, updateTopics, type PushState } from "./push";

const TOPIC_ROWS: { key: keyof PushTopics; label: string; description: string; vipOnly?: boolean }[] = [
  { key: "picks", label: "Today's picks", description: "Each morning around 8am, with the best of the day." },
  { key: "results", label: "Yesterday's results", description: "How the picks did, good day or bad." },
  {
    key: "valueAlerts",
    label: "Value alerts",
    description: "When SportyBet prices a pick above fair value.",
    vipOnly: true,
  },
];

/**
 * Notification settings for THIS device: switching on, the topics, a test,
 * switching off. Used by the account page and the notification sheet.
 *
 * Settings are per device on purpose: notifications are a property of the
 * phone that receives them, and someone may want the morning picks on their
 * phone but not on a work laptop.
 */
export function NotificationControls({
  showValueAlerts = false,
  onEnabled,
}: {
  /** Show the VIP value-alerts switch. Only the account page knows the tier. */
  showValueAlerts?: boolean;
  onEnabled?: () => void;
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [topics, setTopics] = useState<PushTopics | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const s = await pushState();
      if (!live) return;
      setState(s);
      if (s === "on") {
        const t = await loadTopics().catch(() => null);
        if (live) setTopics(t);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote(null);
    try {
      const result = await enablePush();
      setState(result.state);
      if (result.topics) setTopics(result.topics);
      track("push_enable", { outcome: result.state });
      if (result.state === "on") onEnabled?.();
    } catch {
      setNote({ tone: "error", text: "Couldn't switch notifications on. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote(null);
    try {
      await disablePush();
      setState("off");
      setTopics(null);
      track("push_disable");
    } catch {
      setNote({ tone: "error", text: "Couldn't switch them off. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(key: keyof PushTopics, value: boolean) {
    if (!topics) return;
    const before = topics;
    setTopics({ ...topics, [key]: value });
    setNote(null);
    try {
      const saved = await updateTopics({ [key]: value });
      if (saved) setTopics(saved);
    } catch {
      setTopics(before);
      setNote({ tone: "error", text: "Couldn't save that. Try again." });
    }
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const result = await sendTestPush();
    setNote(result.ok ? { tone: "ok", text: "Sent. It should arrive in a few seconds." } : { tone: "error", text: result.error });
    setBusy(false);
  }

  if (state === null) return <p className="text-sm text-ink-dim">Checking this device…</p>;

  if (state === "unsupported") {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        This browser can&apos;t show notifications. On Android, open BetriX in Chrome. On iPhone, add BetriX to your
        Home Screen first.
      </p>
    );
  }

  if (state === "needs-install") {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-muted">
          On iPhone, notifications only work in the BetriX app on your Home Screen. Add it, open it from there, and
          switch them on.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="px-4 py-2.5"
          onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT))}
        >
          How to add BetriX
        </Button>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Notifications are blocked for BetriX on this device. Allow them in your browser or phone settings, then come
        back here.
      </p>
    );
  }

  if (state === "off") {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-muted">
          {showValueAlerts
            ? "Today's picks and how yesterday's went each morning, plus your value alerts. Switch them off any time."
            : "One notification each morning: today's picks and how yesterday's went. Switch them off any time."}
        </p>
        <Button type="button" onClick={() => void turnOn()} disabled={busy} className="px-4 py-2.5">
          {busy ? "Switching on…" : "Turn on notifications"}
        </Button>
        {note && <p className={`text-sm ${note.tone === "ok" ? "text-brand" : "text-rose"}`}>{note.text}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {TOPIC_ROWS.filter((row) => !row.vipOnly || showValueAlerts).map((row) => (
          <label
            key={row.key}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3.5 text-sm"
          >
            <input
              type="checkbox"
              checked={topics?.[row.key] ?? true}
              disabled={!topics}
              onChange={(e) => void toggle(row.key, e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-brand)]"
            />
            <span>
              <span className="font-medium">{row.label}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{row.description}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void test()} disabled={busy} className="px-4 py-2.5">
          Send a test
        </Button>
        <Button type="button" variant="ghost" onClick={() => void turnOff()} disabled={busy} className="px-4 py-2.5">
          Turn off on this device
        </Button>
      </div>
      {note && <p className={`text-sm ${note.tone === "ok" ? "text-brand" : "text-rose"}`}>{note.text}</p>}
    </div>
  );
}
