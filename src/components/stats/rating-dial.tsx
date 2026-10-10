import { ratingColor } from "@/lib/stats/compute";

/**
 * A club's 1-10 rating as a dial that sweeps up to its value, coloured from
 * red (weak) to green (strong). The sweep is a registered CSS property
 * (.dial in globals.css), so it animates without JavaScript.
 */
export function RatingDial({ score, size = 44, index = 0 }: { score: number; size?: number; index?: number }) {
  return (
    <span
      className="dial relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        ["--dial-to" as string]: score / 10,
        ["--dial-color" as string]: ratingColor(score),
        ["--i" as string]: index,
      }}
      role="img"
      aria-label={`Rated ${score.toFixed(1)} out of 10`}
    >
      <span className="tnum font-mono font-medium leading-none" style={{ fontSize: size * 0.32, color: ratingColor(score, 0.82) }}>
        {score.toFixed(1)}
      </span>
    </span>
  );
}

/** The same rating as a slim horizontal meter. */
export function RatingBar({ score, index = 0 }: { score: number; index?: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <span
        className="seg-grow block h-full rounded-full"
        style={{ width: `${score * 10}%`, background: ratingColor(score), animationDelay: `${Math.min(index, 14) * 40}ms` }}
      />
    </span>
  );
}
