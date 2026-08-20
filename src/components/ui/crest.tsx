"use client";

import { useState } from "react";

/**
 * Club or competition badge with a graceful fallback.
 *
 * Crests come from several upstream CDNs and individual images 404 or time
 * out fairly regularly, so a failed load falls back to the club's initials
 * rather than leaving a broken-image icon in the middle of a fixture row.
 * next/image is deliberately avoided here: the hosts change often enough that
 * maintaining remotePatterns would be a standing chore.
 */
export function Crest({
  src,
  name,
  size = 28,
}: {
  src?: string;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (!src || failed) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full bg-surface-3 font-semibold text-ink-muted"
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
        aria-hidden
      >
        {letters}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full object-contain"
      style={{ width: size, height: size }}
    />
  );
}
