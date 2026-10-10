import { LogoLockup } from "@/components/brand/logo";

/**
 * Splash screen for the installed app.
 *
 * Shown only in standalone display mode (opened from the home screen), and
 * only on a cold start: it lives in the root layout, which client-side
 * navigation never re-renders. Pure CSS, no JavaScript: the overlay draws
 * with the first paint and fades itself out, so it can never get stuck or
 * delay a visitor in a browser tab, where it is display:none.
 */
export function AppSplash() {
  return (
    <div className="app-splash" aria-hidden>
      <span className="app-splash-mark">
        <LogoLockup className="h-14 w-auto text-ink" />
      </span>
      <span className="app-splash-bar" />
    </div>
  );
}
