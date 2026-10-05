import { ViewTransition, type ReactNode } from "react";

/** A view-transition name from any id ("sdb:123" is not a valid CSS ident). */
export function morphName(...parts: string[]): string {
  return `m-${parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * An element that morphs into its namesake on the next page: a club crest
 * in a fixtures row grows into the crest on the match page.
 *
 * Names must be unique on a page, so only lists that show each match once
 * use it. Browsers without the View Transitions API just navigate.
 */
export function Morph({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
