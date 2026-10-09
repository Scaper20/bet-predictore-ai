"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  FORGE_FREE_DAILY,
  FORGE_GUEST_TOTAL,
  FORGE_MARKETS,
  FORGE_WHEN,
  RISK_PRESETS,
  bestSwap,
  legOdds,
  oneIn,
  slipTotals,
  type ForgeLeg,
  type ForgeMarket,
  type ForgeRisk,
  type ForgeSettings,
} from "@/lib/forge";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES } from "@/lib/leagues";
import { useSlip, type SlipLeg } from "@/lib/slip";
import { trackSlip } from "@/lib/tracked-slips";
import { kickoffDay, kickoffTime } from "@/lib/format";
import { sportPath } from "@/lib/routes";
import { Spinner } from "@/components/ui/primitives";
import { BuildProgress, useBuildProgress } from "@/components/forge/build-progress";

/* ------------------------------------------------------------------ state */

interface Allowance {
  signedIn: boolean;
  paid: boolean;
  used: number | null;
  limit: number | null;
  myLeagues: { code: string; name: string }[];
}

interface Slip {
  legs: ForgeLeg[];
  bench: ForgeLeg[];
  pricedAt: string;
  /** Games removed or swapped out — never offered again on this slip. */
  removed: string[];
  /** The settings it was built with, for the header line. */
  settings: ForgeSettings;
}

const SETTINGS_KEY = "betrix.forge.settings.v1";
const SLIP_KEY = "betrix.forge.slip.v1";

function load<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: settings just won't be remembered.
  }
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

/* ----------------------------------------------------------------- studio */

export function ForgeStudio() {
  const router = useRouter();
  const { add } = useSlip();
  const [settings, setSettings] = useState<ForgeSettings>(DEFAULT_SETTINGS);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [gated, setGated] = useState(false);
  const [view, setView] = useState<"settings" | "result">("settings");
  const [toast, setToast] = useState<ReactNode>(null);
  const progress = useBuildProgress(busy);

  // Remembered settings and the last slip, restored after hydration.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = load<ForgeSettings>(SETTINGS_KEY);
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
      const last = load<Slip>(SLIP_KEY);
      // A slip whose first game has kicked off is stale; start fresh.
      if (last?.legs.length && last.legs.every((l) => Date.parse(l.kickoff) > Date.now())) setSlip(last);
    }, 0);
    fetch("/api/forge", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: Allowance | null) => a && setAllowance(a))
      .catch(() => {});
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => save(SETTINGS_KEY, settings), [settings]);
  useEffect(() => save(SLIP_KEY, slip), [slip]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const patch = (p: Partial<ForgeSettings>) => setSettings((s) => ({ ...s, ...p }));
  const remaining =
    allowance && allowance.limit !== null && allowance.used !== null ? Math.max(0, allowance.limit - allowance.used) : null;

  const generate = useCallback(
    async (again: boolean) => {
      if (busy) return;
      if (allowance && !allowance.signedIn && remaining === 0) {
        setGated(true);
        return;
      }
      setBusy(true);
      setError(null);
      const keep = again && slip ? slip.legs.filter((l) => locked.has(l.matchId)) : [];
      try {
        const res = await fetch("/api/forge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings,
            state: {
              locked: keep.map((l) => ({ matchId: l.matchId, market: l.market })),
              removed: again && slip ? slip.removed : [],
              avoid: again && slip ? slip.legs.filter((l) => !locked.has(l.matchId)).map((l) => l.matchId) : [],
              seed: Math.floor(Math.random() * 2 ** 31),
            },
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || body.error) {
          if (body?.code === "guest_limit") {
            setGated(true);
            setAllowance((a) => (a ? { ...a, used: a.limit } : a));
          } else {
            setError({ message: body?.error ?? "Something went wrong. Try again.", code: body?.code });
          }
          return;
        }
        setSlip({
          legs: body.legs,
          bench: body.bench,
          pricedAt: body.pricedAt,
          removed: again && slip ? slip.removed : [],
          settings,
        });
        setLocked((prev) => new Set([...prev].filter((id) => (body.legs as ForgeLeg[]).some((l) => l.matchId === id))));
        setAllowance((a) => (a ? { ...a, used: body.used ?? a.used, limit: body.limit ?? a.limit } : a));
        setView("result");
        if (body.dropped?.length) {
          setToast(`${body.dropped.length} kept ${body.dropped.length === 1 ? "game has" : "games have"} kicked off or dropped out, so ${body.dropped.length === 1 ? "it was" : "they were"} replaced.`);
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setError({ message: "Connection lost. Check your network and try again." });
      } finally {
        setBusy(false);
      }
    },
    [busy, allowance, remaining, slip, locked, settings],
  );

  const removeLeg = (leg: ForgeLeg) =>
    setSlip((s) => (s ? { ...s, legs: s.legs.filter((l) => l.matchId !== leg.matchId), removed: [...s.removed, leg.matchId] } : s));

  const swapLeg = (leg: ForgeLeg) =>
    setSlip((s) => {
      if (!s) return s;
      const next = bestSwap(leg, s.bench, new Set(s.legs.map((l) => l.matchId)));
      if (!next) return s;
      return {
        ...s,
        legs: s.legs.map((l) => (l.matchId === leg.matchId ? next : l)),
        bench: s.bench.filter((b) => b.matchId !== next.matchId),
        removed: [...s.removed, leg.matchId],
      };
    });

  const toggleLock = (id: string) =>
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const asSlipLegs = (legs: ForgeLeg[]): SlipLeg[] =>
    legs.map((l) => ({
      matchId: l.matchId,
      fixture: l.fixture,
      homeName: l.homeName,
      awayName: l.awayName,
      league: l.league,
      kickoff: l.kickoff,
      market: l.market,
      label: l.label,
      probability: l.probability,
      fairOdds: l.fairOdds,
      ...(l.price ? { bookmakerOdds: l.price, oddsSource: "sportybet" as const } : {}),
    }));

  const addToSlip = () => {
    if (!slip?.legs.length) return;
    asSlipLegs(slip.legs).forEach(add);
    setToast(
      <>
        {slip.legs.length} {slip.legs.length === 1 ? "game" : "games"} added to your slip.{" "}
        <Link href={sportPath("slip")} className="font-semibold text-brand underline-offset-2 hover:underline">
          View slip
        </Link>
      </>,
    );
  };

  const track = () => {
    if (!slip?.legs.length) return;
    if (trackSlip(asSlipLegs(slip.legs))) router.push(sportPath("trackedSlips"));
  };

  const share = async () => {
    if (!slip?.legs.length) return;
    const t = slipTotals(slip.legs, EXAMPLE_STAKE);
    const text = [
      `My BetriX Forge slip · total odds ${t.odds.toFixed(2)}`,
      ...slip.legs.map((l) => `• ${l.fixture}: ${l.label} @ ${legOdds(l).toFixed(2)}`),
      `Built on betrix.com.ng — probabilities, not guarantees. 18+`,
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setToast("Slip copied. Paste it into WhatsApp or anywhere.");
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  const hasSlip = Boolean(slip?.legs.length);

  return (
    <div className="relative">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        {/* ------------------------------------------------------ settings */}
        <div className={`${view === "result" && hasSlip ? "hidden lg:block" : ""} lg:sticky lg:top-[calc(var(--header-h)+1rem)]`}>
          <SettingsPanel
            settings={settings}
            patch={patch}
            allowance={allowance}
            remaining={remaining}
            busy={busy}
            progress={progress}
            onGenerate={() => void generate(false)}
          />
          {error && view === "settings" && <p className="mt-3 text-sm text-rose">{error.message}</p>}
        </div>

        {/* ------------------------------------------------------- results */}
        <div className={view === "settings" || !hasSlip ? "hidden lg:block" : ""}>
          {hasSlip && slip ? (
            <ResultPanel
              slip={slip}
              locked={locked}
              busy={busy}
              progress={progress}
              error={error}
              remaining={remaining}
              allowance={allowance}
              onBack={() => setView("settings")}
              onAgain={() => void generate(true)}
              onAdd={addToSlip}
              onTrack={track}
              onShare={() => void share()}
              onLock={toggleLock}
              onSwap={swapLeg}
              onRemove={removeLeg}
            />
          ) : (
            <EmptyResult />
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-4 z-50 mx-auto max-w-md rounded-xl border border-line bg-shell px-4 py-3 text-sm text-ink shadow-2xl lift-above-bottom-nav lg:right-6 lg:left-auto">
          {toast}
        </div>
      )}

      {gated && <GuestGate onClose={() => setGated(false)} />}
    </div>
  );
}

/**
 * Forge doesn't take bets or stakes, so there is no stake box: a field for
 * money reads as if the slip could be placed here. What a slip pays is
 * still worth knowing, so it is shown on one fixed example amount.
 */
const EXAMPLE_STAKE = 1000;

function ReturnInsight({ odds, probability }: { odds: number; probability: number }) {
  const returns = Math.round(EXAMPLE_STAKE * odds);
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-brand/20 bg-brand/[0.06] px-4 py-3.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 text-brand" aria-hidden>
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 3v14M6.5 6.5h5a2.5 2.5 0 0 1 0 5h-3a2.5 2.5 0 0 0 0 5H14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="text-sm leading-relaxed text-ink-muted">
        If you placed <span className="font-semibold text-ink">{naira(EXAMPLE_STAKE)}</span> on this slip with your bookmaker, it
        would pay <span className="tnum font-bold text-brand">{naira(returns)}</span>{" "}
        <span className="text-ink-dim">(₦{(returns - EXAMPLE_STAKE).toLocaleString("en-NG")} profit)</span> if every pick lands
        {probability > 0 && probability < 1 ? (
          <>, which a slip like this does {oneIn(probability)}{1 / probability >= 1.15 ? " times" : ""}.</>
        ) : (
          "."
        )}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- settings */

function SettingsPanel({
  settings,
  patch,
  allowance,
  remaining,
  busy,
  progress,
  onGenerate,
}: {
  settings: ForgeSettings;
  patch: (p: Partial<ForgeSettings>) => void;
  allowance: Allowance | null;
  remaining: number | null;
  busy: boolean;
  progress: number | null;
  onGenerate: () => void;
}) {
  const [oddsText, setOddsText] = useState(settings.targetOdds.toFixed(2));
  useEffect(() => {
    const t = window.setTimeout(() => setOddsText(settings.targetOdds.toFixed(2)), 0);
    return () => window.clearTimeout(t);
  }, [settings.targetOdds]);

  const toggleMarket = (m: ForgeMarket) => {
    const has = settings.markets.includes(m);
    if (has && settings.markets.length === 1) return; // keep at least one
    patch({ markets: has ? settings.markets.filter((x) => x !== m) : [...settings.markets, m] });
  };

  const paid = allowance?.paid ?? false;
  const picksHelp: Record<1 | 2 | 3, string> = {
    1: "One selection per game — the classic accumulator.",
    2: 'Up to 2 lets Forge pair picks in one game, like "Arsenal & Over 1.5". Both come from the same scoreline model, so the combined chance is exact, not guessed.',
    3: "Up to 3 adds a third line to the same game (result, goals and GG/NG). Bigger odds per game, fewer games needed.",
  };

  return (
    <div className="card p-5 sm:p-6">
      <div className="space-y-6">
        <Section title="How do you like to bet?">
          <div className="grid grid-cols-3 gap-2.5">
            {(Object.keys(RISK_PRESETS) as ForgeRisk[]).map((r) => {
              const active = settings.risk === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => patch({ risk: r, targetOdds: RISK_PRESETS[r].targetOdds, games: RISK_PRESETS[r].games })}
                  aria-pressed={active}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active ? "border-brand/60 bg-brand/10" : "border-line bg-surface-2/40 hover:border-line-strong"
                  }`}
                >
                  <span className={`block text-sm font-bold ${active ? "text-brand" : "text-ink"}`}>{RISK_PRESETS[r].label}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-ink-muted">{RISK_PRESETS[r].blurb}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Section title="Total odds you want">
            <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 focus-within:border-brand/50">
              <input
                inputMode="decimal"
                value={oddsText}
                onChange={(e) => setOddsText(e.target.value)}
                onBlur={() => {
                  const n = Number.parseFloat(oddsText.replace(",", "."));
                  if (Number.isFinite(n) && n >= 1.2) patch({ targetOdds: Math.min(1000, Math.round(n * 100) / 100) });
                  else setOddsText(settings.targetOdds.toFixed(2));
                }}
                className="tnum w-full min-w-0 bg-transparent font-mono text-lg font-bold text-ink outline-none"
                aria-label="Total odds you want"
              />
              <span className="shrink-0 text-[11px] font-medium text-ink-dim">{oneIn(1 / settings.targetOdds)}</span>
            </label>
          </Section>
          <Section title="Number of games">
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-2 py-1.5">
              <StepButton label="Fewer games" onClick={() => patch({ games: Math.max(1, settings.games - 1) })}>
                −
              </StepButton>
              <span className="tnum font-mono text-lg font-bold">{settings.games}</span>
              <StepButton label="More games" onClick={() => patch({ games: Math.min(10, settings.games + 1) })}>
                +
              </StepButton>
            </div>
          </Section>
        </div>

        <Section title="Picks per game">
          <div className="grid grid-cols-3 rounded-xl border border-line bg-surface-2/40 p-1">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={settings.picksPerGame === n}
                onClick={() => patch({ picksPerGame: n })}
                className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  settings.picksPerGame === n ? "bg-brand text-brand-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {n === 1 ? "1 per game" : `Up to ${n}`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-dim">{picksHelp[settings.picksPerGame]}</p>
        </Section>

        <Section title="Markets">
          <div className="flex flex-wrap gap-2">
            {FORGE_MARKETS.map((m) => {
              const lockedOut = m.paid && !paid;
              const on = settings.markets.includes(m.id) && !lockedOut;
              return lockedOut ? (
                <Link
                  key={m.id}
                  href="/pricing"
                  className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm text-ink-dim hover:text-ink-muted"
                  title={`${m.label} is part of Pro`}
                >
                  {m.label}
                  <span className="rounded bg-violet/15 px-1.5 py-px text-[10px] font-semibold text-violet">Pro</span>
                </Link>
              ) : (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMarket(m.id)}
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                    on ? "border-brand/40 bg-brand/12 text-brand" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Section title="Leagues">
            <Select value={settings.leagues} onChange={(v) => patch({ leagues: v })} label="Leagues">
              <option value="all">All leagues</option>
              {allowance?.myLeagues.length ? <option value="mine">My leagues ({allowance.myLeagues.length})</option> : null}
              <optgroup label="Clubs">
                {CLUB_LEAGUES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.shortName}
                  </option>
                ))}
              </optgroup>
              <optgroup label="National teams">
                {INTERNATIONAL_LEAGUES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.shortName}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Section>
          <Section title="When">
            <Select value={settings.when} onChange={(v) => patch({ when: v as ForgeSettings["when"] })} label="When">
              {FORGE_WHEN.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Section>
        </div>
      </div>

      <div
        style={{ bottom: "calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom))" }}
        className="sticky -mx-5 mt-6 bg-gradient-to-t from-shell via-shell to-transparent px-5 pb-1 pt-4 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-none lg:p-0">
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-base font-bold text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? "Building your slip…" : "Generate slip"}
        </button>
        {progress !== null ? (
          <BuildProgress pct={progress} className="mt-3" />
        ) : (
          <AllowanceLine allowance={allowance} remaining={remaining} />
        )}
      </div>
    </div>
  );
}

function AllowanceLine({ allowance, remaining }: { allowance: Allowance | null; remaining: number | null }) {
  if (!allowance) return null;
  return (
    <p className="mt-2.5 text-center text-[11px] text-ink-dim">
      {allowance.paid
        ? "Unlimited slips with your plan"
        : !allowance.signedIn
          ? `${remaining ?? FORGE_GUEST_TOTAL} of ${FORGE_GUEST_TOTAL} free slips without an account`
          : `${remaining ?? FORGE_FREE_DAILY} of ${FORGE_FREE_DAILY} slips left today`}
      {!allowance.paid && (
        <>
          {" · "}
          <Link href={allowance.signedIn ? "/pricing" : "/account/sign-up?next=/football/forge"} className="hover:text-ink hover:underline">
            {allowance.signedIn ? "Pro: unlimited" : `Sign up free for ${FORGE_FREE_DAILY} a day`}
          </Link>
        </>
      )}
    </p>
  );
}

/* ---------------------------------------------------------------- results */

function ResultPanel({
  slip,
  locked,
  busy,
  progress,
  error,
  remaining,
  allowance,
  onBack,
  onAgain,
  onAdd,
  onTrack,
  onShare,
  onLock,
  onSwap,
  onRemove,
}: {
  slip: Slip;
  locked: Set<string>;
  busy: boolean;
  progress: number | null;
  error: { message: string; code?: string } | null;
  remaining: number | null;
  allowance: Allowance | null;
  onBack: () => void;
  onAgain: () => void;
  onAdd: () => void;
  onTrack: () => void;
  onShare: () => void;
  onLock: (id: string) => void;
  onSwap: (leg: ForgeLeg) => void;
  onRemove: (leg: ForgeLeg) => void;
}) {
  const t = useMemo(() => slipTotals(slip.legs, EXAMPLE_STAKE), [slip.legs]);
  const onSlip = new Set(slip.legs.map((l) => l.matchId));
  const style = RISK_PRESETS[slip.settings.risk].label;
  const target = slip.settings.targetOdds;
  const off = Math.abs(Math.log(t.odds) - Math.log(target)) > 0.35;
  const pricedTime = new Date(slip.pricedAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      {progress !== null && <BuildProgress pct={progress} className="card px-4 py-3" />}
      {/* mobile: back to settings */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <span aria-hidden>‹</span> Change settings
        </button>
        <span className="rounded-lg bg-brand/12 px-3 py-1.5 text-xs font-semibold text-brand">
          {style} · {slip.legs.length} {slip.legs.length === 1 ? "game" : "games"}
        </span>
      </div>

      <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Your slip · {style} · {slip.legs.length} {slip.legs.length === 1 ? "game" : "games"}
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={onAgain} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : null} Generate again
          </ActionButton>
          <ActionButton onClick={onShare}>Share</ActionButton>
          <ActionButton onClick={onAdd} primary>
            Add to my slip
          </ActionButton>
        </div>
      </div>

      {/* totals */}
      <div className="card p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-3">
          <Total label="Total odds" value={t.odds.toFixed(2)} />
          <Total label="Chance to win" value={pct(t.probability)} hint={oneIn(t.probability)} />
        </div>
        <ReturnInsight odds={t.odds} probability={t.probability} />
        <p className="mt-4 text-xs leading-relaxed text-ink-dim">
          {t.picks} {t.picks === 1 ? "pick" : "picks"} across {slip.legs.length} {slip.legs.length === 1 ? "game" : "games"}.{" "}
          {t.priced > 0
            ? `SportyBet odds as of ${pricedTime}${t.priced === slip.legs.length ? "" : ` on ${t.priced} of ${slip.legs.length} games`}. Odds change before kick-off.`
            : "Estimated odds; your bookmaker's will differ."}
          {off && ` Closest the card allows to the ${target.toFixed(2)} you asked for.`}
        </p>
        {error && <p className="mt-2 text-xs text-rose">{error.message}</p>}
      </div>

      {/* legs */}
      <div className="grid gap-3 md:grid-cols-2">
        {slip.legs.map((leg) => (
          <LegCard
            key={leg.matchId}
            leg={leg}
            locked={locked.has(leg.matchId)}
            canSwap={slip.bench.some((b) => !onSlip.has(b.matchId))}
            onLock={() => onLock(leg.matchId)}
            onSwap={() => onSwap(leg)}
            onRemove={() => onRemove(leg)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-xs text-ink-dim">&ldquo;Keep&rdquo; holds a game when you generate again. Probabilities, not guarantees. 18+</p>
        <button type="button" onClick={onTrack} className="text-xs font-semibold text-violet hover:underline">
          Track this slip live →
        </button>
      </div>

      {/* mobile action bar */}
      <div
        className="fixed inset-x-0 z-30 border-t border-line bg-shell/95 px-4 pb-3 pt-3 backdrop-blur lg:hidden"
        style={{ bottom: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))" }}
      >
        <div className="grid grid-cols-[auto_1fr_1fr] gap-2.5">
          <ActionButton onClick={onShare} aria-label="Share">
            <ShareIcon />
          </ActionButton>
          <ActionButton onClick={onAgain} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : null} Generate again
          </ActionButton>
          <ActionButton onClick={onAdd} primary>
            Add to my slip
          </ActionButton>
        </div>
        {allowance && !allowance.paid && remaining !== null && (
          <p className="mt-1.5 text-center text-[10.5px] text-ink-dim">
            {remaining} {allowance.signedIn ? "left today" : "free slips left"}
          </p>
        )}
      </div>
    </div>
  );
}

function LegCard({
  leg,
  locked,
  canSwap,
  onLock,
  onSwap,
  onRemove,
}: {
  leg: ForgeLeg;
  locked: boolean;
  canSwap: boolean;
  onLock: () => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const combo = leg.picks.length > 1;
  return (
    <article className={`card flex flex-col p-4 sm:p-5 ${combo ? "border-violet/35" : ""} ${locked ? "ring-1 ring-brand/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-ink-dim">
          {leg.league} · {kickoffDay(leg.kickoff)} {kickoffTime(leg.kickoff)}
        </p>
        {combo && (
          <span className="shrink-0 rounded-md bg-violet/15 px-2 py-0.5 text-[11px] font-semibold text-violet">
            {leg.picks.length} picks · 1 game
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <Link href={`/football/match/${encodeURIComponent(leg.matchId)}`} className="min-w-0 truncate text-base font-bold text-ink hover:text-brand">
          {leg.fixture}
        </Link>
        <span className="shrink-0 text-right">
          <span className="tnum block font-mono text-lg font-bold">{legOdds(leg).toFixed(2)}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {leg.picks.map((p) => (
          <span key={p.market} className="rounded-md bg-brand/12 px-2.5 py-1 text-xs font-semibold text-brand">
            {p.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-xs text-ink-muted">
          {pct(leg.probability)} chance · {leg.price ? "SportyBet" : "fair"}
        </span>
      </div>
      {leg.reason && <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">{leg.reason}</p>}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <SmallButton onClick={onLock} active={locked} label={locked ? "Kept" : "Keep"}>
          <LockIcon open={!locked} />
        </SmallButton>
        <SmallButton onClick={onSwap} disabled={!canSwap} label="Swap">
          <SwapIcon />
        </SmallButton>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${leg.fixture}`}
          className="ml-auto grid size-9 place-items-center rounded-lg border border-line text-ink-dim transition-colors hover:border-rose/40 hover:text-rose"
        >
          ✕
        </button>
      </div>
    </article>
  );
}

function EmptyResult() {
  const steps = [
    ["Tell Forge how you bet", "Safe, balanced or risky; the odds you're after; how many games."],
    ["Generate", "Forge reads every modelled fixture in your window and builds the slip that best fits."],
    ["Make it yours", "Keep the games you like, swap the rest, then add it to your slip or track it live."],
  ];
  return (
    <div className="card flex min-h-[28rem] flex-col justify-center p-8">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Your slip appears here</p>
      <ol className="mt-6 space-y-5">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line font-mono text-sm font-bold text-ink-muted">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-xs text-ink-dim">
        Every pick comes from the BetriX model, with SportyBet prices where they list it. Probabilities, not guarantees. 18+
      </p>
    </div>
  );
}

function GuestGate({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/60 p-5 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-shell p-6 text-center shadow-2xl">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">BetriX Forge</p>
        <p className="mt-3 font-display text-2xl font-bold">Keep forging slips</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          You&apos;ve used your {FORGE_GUEST_TOTAL} free slips. Create a free account for {FORGE_FREE_DAILY} a day. Your
          settings and last slip stay right here.
        </p>
        <div className="mt-5 space-y-2.5">
          <Link
            href="/account/sign-up?next=/football/forge"
            className="block rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-strong"
          >
            Create free account
          </Link>
          <Link
            href="/account/login?next=/football/forge"
            className="block rounded-lg border border-line px-4 py-3 text-sm font-medium text-ink hover:border-line-strong"
          >
            I already have an account
          </Link>
        </div>
        <button type="button" onClick={onClose} className="mt-4 text-xs text-ink-dim hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm font-medium text-ink outline-none focus:border-brand/50"
    >
      {children}
    </select>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg text-xl text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
    >
      {children}
    </button>
  );
}

function Total({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-ink-muted">{label}</p>
      <p className={`tnum mt-1 truncate font-mono text-2xl font-bold sm:text-3xl ${accent ? "text-brand" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-ink-dim">{hint}</p>}
    </div>
  );
}

function ActionButton({
  primary = false,
  children,
  ...props
}: { primary?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60 ${
        primary ? "bg-brand text-brand-ink hover:bg-brand-strong" : "border border-line-strong bg-surface text-ink hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function SmallButton({
  onClick,
  label,
  active = false,
  disabled = false,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
        active ? "border-brand/50 bg-brand/12 text-brand" : "border-line text-ink hover:border-line-strong"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function LockIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d={open ? "M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" : "M5.5 7V5a2.5 2.5 0 0 1 5 0v2"} strokeLinecap="round" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 2v8M5 4.5 8 1.5l3 3M3 8v5h10V8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
