/** Opens the walkthrough (components/tour/tour-overlay.tsx). */
export const OPEN_TOUR_EVENT = "kiqstat-open-tour";
/** Set once the walkthrough has been finished or skipped in this browser. */
export const TOUR_DONE_KEY = "kiqstat.tour.v1";

export function openTour() {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}
