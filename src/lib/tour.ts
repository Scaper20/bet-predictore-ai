/** Opens the walkthrough (components/tour/tour-overlay.tsx). */
export const OPEN_TOUR_EVENT = "kiqstat-open-tour";
/** Set once the walkthrough has been finished or skipped in this browser. */
// Bumped when the tour changes enough that people who finished it should see it again.
export const TOUR_DONE_KEY = "kiqstat.tour.v2";

export function openTour() {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}

/** Fired when the walkthrough closes, finished or skipped: the popup offer follows it. */
export const TOUR_CLOSED_EVENT = "kiqstat-tour-closed";
/** Asks the popup offer (components/offers) to open. */
export const OPEN_OFFER_EVENT = "kiqstat-open-offer";

export function openOffer() {
  window.dispatchEvent(new Event(OPEN_OFFER_EVENT));
}

/** Pages with prediction cards to point at, where the walkthrough starts on its own. */
const AUTO_PATHS = [/^\/$/, /^\/[a-z]+\/predictions\/?$/];

export function tourStartsOn(pathname: string): boolean {
  return AUTO_PATHS.some((re) => re.test(pathname));
}

export function tourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === "1";
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}
