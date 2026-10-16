/** Opens the walkthrough (components/tour/tour-overlay.tsx). */
export const OPEN_TOUR_EVENT = "kiqstat-open-tour";
/** Set once the walkthrough has been finished or skipped in this browser. */
// Bumped when the tour changes enough that people who finished it should see it again.
export const TOUR_DONE_KEY = "kiqstat.tour.v2";

export function openTour() {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}
