"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  FORGE_FREE_DAILY,
  FORGE_PAID_DAILY,
  FORGE_GUEST_TOTAL,
  FORGE_MARKETS,
  FORGE_WHEN,
  legOdds,
  nextBest,
  oneIn,
  slipTotals,
  type ForgeLeg,
  type ForgeMarket,
  type ForgeRisk,
  type ForgeSettings,
} from "@/lib/forge";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES, leagueByCode } from "@/lib/leagues";
import { PRO_LEAGUE_COUNT, isProLeague, proLeagueReason } from "@/lib/pro-leagues";
import { ProTag } from "@/components/entitlements/locked-pick";
import { useSlip, type SlipLeg } from "@/lib/slip";
import { trackSlip } from "@/lib/tracked-slips";
import { LocalTime } from "@/components/ui/local-time";
import { sportPath } from "@/lib/routes";
import { Spinner } from "@/components/ui/primitives";
import { BuildProgress, useBuildProgress } from "@/components/forge/build-progress";
import { openSlipSheet } from "@/components/layout/nav-actions";
import { RiskBadge } from "@/components/ui/risk-badge";
import { BookCodeButton } from "@/components/slip/book-code-button";

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
  /** Games left out because they are in a Pro league (free plan). */
  proHeld?: number;
  /** Why the combo falls short of the games or price asked for (lib/forge-solve.ts). */
  notes?: string[];
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

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** The prices offered as one tap; any other can be typed. */
const PRICE_CHIPS = [1.5, 2, 3, 5, 10, 20];

/** The style a price implies: it sets how unlikely a leg Forge may take (lib/forge.ts legFloorFor). */
function riskFor(target: number): ForgeRisk {
  return target <= 2.5 ? "safe" : target <= 8 ? "balanced" : "risky";
}

const SETTINGS_VERSION = 3;

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
  // Nothing is saved until the remembered settings and slip have been read back:
  // saving the defaults on mount would overwrite them before they load.
  const [restored, setRestored] = useState(false);

  // Remembered settings and the last slip, restored after hydration.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = load<ForgeSettings & { v?: number }>(SETTINGS_KEY);
      // Settings saved before best-first builds carried a fixed game count; keep the rest.
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s, ...(s.v === SETTINGS_VERSION ? {} : { games: DEFAULT_SETTINGS.games }) });
      const last = load<Slip>(SLIP_KEY);
      // A slip whose first game has kicked off is stale; start fresh.
      if (last?.legs.length && last.legs.every((l) => Date.parse(l.kickoff) > Date.now())) setSlip(last);
      setRestored(true);
    }, 0);
    fetch("/api/forge", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: Allowance | null) => a && setAllowance(a))
      .catch(() => {});
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (restored) save(SETTINGS_KEY, { ...settings, v: SETTINGS_VERSION });
  }, [restored, settings]);
  useEffect(() => {
    if (restored) save(SLIP_KEY, slip);
  }, [restored, slip]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const patch = (p: Partial<ForgeSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...p };
      return { ...next, risk: riskFor(next.targetOdds) };
    });
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
          proHeld: typeof body.proHeld === "number" ? body.proHeld : 0,
          notes: Array.isArray(body.notes) ? body.notes.filter((n: unknown): n is string => typeof n === "string") : [],
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
      const next = nextBest(s.bench, new Set(s.legs.map((l) => l.matchId)));
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
        {slip.legs.length} {slip.legs.length === 1 ? "game" : "games"} added to your combo.{" "}
        <button type="button" onClick={openSlipSheet} className="font-semibold text-brand underline-offset-2 hover:underline">
          View combo
        </button>
      </>,
    );
  };

  const track = () => {
    if (!slip?.legs.length) return;
    if (trackSlip(asSlipLegs(slip.legs))) router.push(sportPath("trackedSlips"));
  };

  const share = async () => {
    if (!slip?.legs.length) return;
    const t = slipTotals(slip.legs, 1);
    const text = [
      `My KiqStat Forge combo · combined price ${t.odds.toFixed(2)}`,
      ...slip.legs.map((l) => `• ${l.fixture}: ${l.label} @ ${legOdds(l).toFixed(2)}`),
      `Built on kiqstat.app — probabilities, not guarantees. 18+`,
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setToast("Combo copied. Paste it into WhatsApp or anywhere.");
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
          {error && view === "settings" && <ForgeError error={error} />}
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
              bookLegs={asSlipLegs(slip.legs)}
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
    1: "One selection per game — the classic combo.",
    2: 'Up to 2 lets Forge pair picks in one game, like "Arsenal & Over 1.5". Both come from the same scoreline model, so the combined chance is exact, not guessed.',
    3: "Up to 3 adds a third line to the same game (result, goals and both teams to score). Bigger price per game, fewer games needed.",
  };

  const custom = !PRICE_CHIPS.includes(settings.targetOdds);

  return (
    <div className="card p-5 sm:p-6">
      <div className="space-y-6">
        <Section title="What price are you after?">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
            {PRICE_CHIPS.map((n) => {
              const on = settings.targetOdds === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => patch({ targetOdds: n })}
                  className={`rounded-xl border py-3 text-center transition-colors ${
                    on ? "border-brand/60 bg-brand/10" : "border-line bg-surface-2/40 hover:border-line-strong"
                  }`}
                >
                  <span className={`tnum block font-mono text-base font-bold ${on ? "text-brand" : "text-ink"}`}>{n.toFixed(n < 10 ? 1 : 0)}</span>
                  <span className="mt-0.5 block text-[10.5px] text-ink-dim">{oneIn(1 / n)}</span>
                </button>
              );
            })}
          </div>
          <label
            className={`mt-2.5 flex items-center gap-3 rounded-xl border px-3.5 py-2.5 focus-within:border-brand/50 ${
              custom ? "border-brand/60 bg-brand/10" : "border-line bg-surface-2"
            }`}
          >
            <span className="shrink-0 text-xs font-medium text-ink-muted">Or type a price</span>
            <input
              inputMode="decimal"
              value={oddsText}
              onChange={(e) => setOddsText(e.target.value)}
              onBlur={() => {
                const n = Number.parseFloat(oddsText.replace(",", "."));
                if (Number.isFinite(n) && n >= 1.2) patch({ targetOdds: Math.min(1000, Math.round(n * 100) / 100) });
                else setOddsText(settings.targetOdds.toFixed(2));
              }}
              className="tnum w-full min-w-0 bg-transparent text-right font-mono text-base font-bold text-ink outline-none"
              aria-label="Combined price you want"
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-ink-dim">
            Forge picks the strongest games on the card, then chooses each game&apos;s line so the combo lands on your
            price.
          </p>
        </Section>

        <Section title="Prediction types">
          <div className="grid grid-cols-2 gap-2">
            {FORGE_MARKETS.map((m) => {
              const lockedOut = m.paid && !paid;
              const on = settings.markets.includes(m.id) && !lockedOut;
              return lockedOut ? (
                <Link
                  key={m.id}
                  href="/pricing"
                  className="flex min-w-0 items-center justify-between gap-1.5 rounded-xl border border-line px-3 py-2.5 text-[13px] text-ink-dim hover:text-ink-muted"
                  title={`${m.label} is part of Pro`}
                >
                  <span className="truncate">{m.label}</span>
                  <span className="shrink-0 rounded bg-violet/15 px-1.5 py-px text-[10px] font-semibold text-violet">Pro</span>
                </Link>
              ) : (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMarket(m.id)}
                  className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                    on ? "border-brand/40 bg-brand/12 text-brand" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  <span className="truncate">{m.label}</span>
                  <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-full border text-[9px] ${on ? "border-brand bg-brand text-brand-ink" : "border-line-strong"}`}>
                    {on ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {(settings.markets.includes("corners") || settings.markets.includes("shots")) && paid && (
            <p className="mt-2 text-xs leading-relaxed text-ink-dim">
              Corners and shots use only the lines that held 82% or more on a season they were not chosen on, and only in
              the leagues with match stats.
            </p>
          )}
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Section title="When">
            <Select value={settings.when} onChange={(v) => patch({ when: v as ForgeSettings["when"] })} label="When">
              {FORGE_WHEN.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Section>
          <Section title="Leagues">
            <Select value={settings.leagues} onChange={(v) => patch({ leagues: v })} label="Leagues">
              <option value="all">All leagues</option>
              {allowance?.myLeagues.length ? <option value="mine">My leagues ({allowance.myLeagues.length})</option> : null}
              <optgroup label="Clubs">
                {CLUB_LEAGUES.filter((l) => paid || !isProLeague(l.code)).map((l) => (
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
              {!paid && (
                <optgroup label="Pro leagues (open at kick-off on Free)">
                  {CLUB_LEAGUES.filter((l) => isProLeague(l.code)).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.shortName} · Pro
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Section>
        </div>

        <details className="group rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            More options
            <span className="flex items-center gap-2 text-xs font-normal text-ink-dim">
              {settings.games} games · {settings.picksPerGame === 1 ? "1 pick" : `${settings.picksPerGame} picks`} a game
              <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
            </span>
          </summary>
          <div className="space-y-5 border-t border-line px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Games</p>
                <p className="text-xs text-ink-dim">Forge fills every one, as long as the card has enough games.</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-line bg-surface-2 px-1.5 py-1">
                <StepButton label="Fewer games" onClick={() => patch({ games: Math.max(1, settings.games - 1) })}>
                  −
                </StepButton>
                <span className="tnum w-7 text-center font-mono text-base font-bold">{settings.games}</span>
                <StepButton label="More games" onClick={() => patch({ games: Math.min(12, settings.games + 1) })}>
                  +
                </StepButton>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Picks in one game</p>
              <div className="mt-2 grid grid-cols-3 rounded-xl border border-line bg-surface-2/40 p-1">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={settings.picksPerGame === n}
                    onClick={() => patch({ picksPerGame: n })}
                    className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                      settings.picksPerGame === n ? "bg-brand text-brand-ink" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {n === 1 ? "1" : `Up to ${n}`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-dim">{picksHelp[settings.picksPerGame]}</p>
            </div>
          </div>
        </details>
      </div>

      {!paid && allowance && isProLeague(settings.leagues) && <ProLeagueNotice code={settings.leagues} />}

      <div
        style={{ bottom: "calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom))" }}
        className="sticky -mx-5 mt-6 bg-gradient-to-t from-shell via-shell to-transparent px-5 pb-1 pt-4 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-none lg:p-0">
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-base font-bold text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? "Building your combo…" : "Generate combo"}
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
        ? `Up to ${FORGE_PAID_DAILY} combos a day with your plan`
        : !allowance.signedIn
          ? `${remaining ?? FORGE_GUEST_TOTAL} of ${FORGE_GUEST_TOTAL} free combos without an account`
          : `${remaining ?? FORGE_FREE_DAILY} of ${FORGE_FREE_DAILY} combos left today`}
      {!allowance.paid && (
        <>
          {" · "}
          <Link href={allowance.signedIn ? "/pricing" : "/account/sign-up?next=/football/forge"} className="hover:text-ink hover:underline">
            {allowance.signedIn ? `Pro: ${FORGE_PAID_DAILY} a day` : `Sign up free for ${FORGE_FREE_DAILY} a day`}
          </Link>
        </>
      )}
    </p>
  );
}

/* ------------------------------------------------------------ Pro leagues */

const UPGRADE_HREF = "/account/billing?plan=pro";

function GoProButton({ label = "Go Pro" }: { label?: string }) {
  return (
    <Link
      href={UPGRADE_HREF}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink hover:bg-brand-strong"
    >
      {label} <span aria-hidden>→</span>
    </Link>
  );
}

/** Under the league picker when a free user picks a Pro league, before they spend a combo on it. */
function ProLeagueNotice({ code }: { code: string }) {
  const name = leagueByCode(code)?.name ?? "This league";
  return (
    <div className="mt-4 rounded-xl border border-violet/30 bg-violet/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ProTag /> {name} is a Pro league
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        {proLeagueReason(code)} On Free its games open at kick-off, so Forge can&apos;t put them in a combo
        beforehand.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-dim">Pro builds combos from all {PRO_LEAGUE_COUNT} Pro leagues and every other league.</p>
        <GoProButton />
      </div>
    </div>
  );
}

/** A failed build. The Pro-league case gets an upgrade card, not an error line. */
function ForgeError({ error, compact = false }: { error: { message: string; code?: string }; compact?: boolean }) {
  if (error.code !== "pro_league") {
    return <p className={compact ? "mt-2 text-xs text-rose" : "mt-3 text-sm text-rose"}>{error.message}</p>;
  }
  return (
    <div className="card mt-3 border-violet/30 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ProTag /> Pro leagues only in that window
      </p>
      <p className="mt-2 text-sm text-ink-muted">{error.message}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-dim">Try All leagues for a free combo, or go Pro to build from every league.</p>
        <GoProButton />
      </div>
    </div>
  );
}

/** Under a free combo when Pro-league games in the window were left out of it. */
function ProHeldNote({ count }: { count: number }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet/30 bg-violet/5 px-4 py-3">
      <p className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
        <ProTag />
        <span>
          {count} {count === 1 ? "game" : "games"} in Pro leagues {count === 1 ? "was" : "were"} left out of this combo.
        </span>
      </p>
      <Link href={UPGRADE_HREF} className="text-xs font-semibold text-brand hover:underline">
        Include them with Pro →
      </Link>
    </div>
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
  bookLegs,
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
  /** The combo as slip legs, for booking it on SportyBet. */
  bookLegs: SlipLeg[];
}) {
  const t = useMemo(() => slipTotals(slip.legs, 1), [slip.legs]);
  const onSlip = new Set(slip.legs.map((l) => l.matchId));
  const target = slip.settings.targetOdds;
  const style = `Price ${target.toFixed(target < 10 ? 2 : 0)}`;
  // Strongest first, the order Forge chose them in.
  const ranked = [...slip.legs].sort((a, b) => b.probability - a.probability);
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
          Your combo · {style} · {slip.legs.length} {slip.legs.length === 1 ? "game" : "games"}
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={onAgain} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : null} Generate again
          </ActionButton>
          <ActionButton onClick={onShare}>Share</ActionButton>
          <ActionButton onClick={onAdd} primary>
            Add to my combo
          </ActionButton>
        </div>
      </div>

      {/* totals */}
      <div className="card p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-3">
          <Total label="Combined price" value={t.odds.toFixed(2)} />
          <Total label="Chance it lands" value={pct(t.probability)} hint={oneIn(t.probability)} />
        </div>
        <RiskBadge pick={{ market: "combo", probability: t.probability }} className="mt-3" />
        <p className="mt-4 text-xs leading-relaxed text-ink-dim">
          {t.picks} {t.picks === 1 ? "pick" : "picks"} across {slip.legs.length} {slip.legs.length === 1 ? "game" : "games"}.{" "}
          {t.priced > 0
            ? `Market prices as of ${pricedTime}${t.priced === slip.legs.length ? "" : ` on ${t.priced} of ${slip.legs.length} games`}. Prices change before kick-off.`
            : "Fair prices from the model; market prices will differ."}
          {off && !slip.notes?.length && ` Closest the card allows to the ${target.toFixed(2)} you asked for.`}
        </p>
        {!!slip.notes?.length && (
          <ul className="mt-3 space-y-1.5 rounded-lg border border-amber/25 bg-amber/8 px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
            {slip.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {error && <ForgeError error={error} compact />}
        {!!slip.proHeld && !error && <ProHeldNote count={slip.proHeld} />}
        <div className="mt-4 border-t border-line pt-4">
          <BookCodeButton
            legs={bookLegs}
            remove={(matchId) => {
              const leg = slip.legs.find((l) => l.matchId === matchId);
              if (leg) onRemove(leg);
            }}
          />
        </div>
      </div>

      {/* legs */}
      <div className="grid gap-3 md:grid-cols-2">
        {ranked.map((leg, i) => (
          <LegCard
            key={leg.matchId}
            rank={i + 1}
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
          Track this combo live →
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
            Add to my combo
          </ActionButton>
        </div>
        {allowance && !allowance.paid && remaining !== null && (
          <p className="mt-1.5 text-center text-[10.5px] text-ink-dim">
            {remaining} {allowance.signedIn ? "left today" : "free combos left"}
          </p>
        )}
      </div>
    </div>
  );
}

function LegCard({
  rank,
  leg,
  locked,
  canSwap,
  onLock,
  onSwap,
  onRemove,
}: {
  rank: number;
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
        <p className="flex min-w-0 items-center gap-2 text-xs text-ink-dim">
          <span
            title={rank === 1 ? "The strongest pick on this combo" : `Pick ${rank} by strength`}
            className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${rank === 1 ? "bg-brand text-brand-ink" : "bg-surface-3 text-ink-muted"}`}
          >
            {rank}
          </span>
          <span className="min-w-0 truncate">
            {leg.league} · <LocalTime iso={leg.kickoff} kind="day" /> <LocalTime iso={leg.kickoff} />
          </span>
        </p>
        {combo && (
          <span className="shrink-0 rounded-md bg-violet/15 px-2 py-0.5 text-[11px] font-semibold text-violet">
            {leg.picks.length} picks · 1 game
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <Link href={`/football/match/${encodeURIComponent(leg.matchId)}`} prefetch={false} className="min-w-0 truncate text-base font-bold text-ink hover:text-brand">
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
        <span className="ml-auto flex items-center gap-2 font-mono text-xs text-ink-muted">
          <RiskBadge pick={{ market: "leg", probability: leg.probability }} />
          {pct(leg.probability)} chance · {leg.price ? "market" : "fair"}
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
    ["Pick a price", "Tap a price, or type your own, and choose what kinds of prediction to use."],
    ["Generate", "Forge reads every modelled game in your window and takes the strongest picks first, then the next strongest, until it reaches your price."],
    ["Make it yours", "Keep the games you like, swap the rest, then add it to your combo or track it live."],
  ];
  return (
    <div className="card flex min-h-[28rem] flex-col justify-center p-8">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Your combo appears here</p>
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
        Every pick comes from the KiqStat model, with market prices where they are listed. Probabilities, not guarantees. 18+
      </p>
    </div>
  );
}

function GuestGate({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/60 p-5 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-shell p-6 text-center shadow-2xl">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">KiqStat Forge</p>
        <p className="mt-3 font-display text-2xl font-bold">Keep forging combos</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          You&apos;ve used your {FORGE_GUEST_TOTAL} free combos. Create a free account for {FORGE_FREE_DAILY} a day. Your
          settings and last combo stay right here.
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
      <p className="mb-2 truncate text-sm font-semibold text-ink">{title}</p>
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
