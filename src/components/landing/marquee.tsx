/**
 * Repeating banner, in the style both reference sites use under the hero.
 *
 * The track is duplicated so the -50% translate loops seamlessly; the copy is
 * hidden from screen readers on the second pass.
 */
export function Marquee({ items, duration = 38 }: { items: string[]; duration?: number }) {
  return (
    <div className="marquee-paused overflow-hidden border-y border-line bg-shell py-3">
      <div className="mask-fade-x flex">
        <div
          className="animate-marquee flex shrink-0 items-center gap-8 pr-8"
          style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
        >
          {[0, 1].map((pass) => (
            <div key={pass} className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={pass === 1}>
              {items.map((item, i) => (
                <span key={`${pass}-${i}`} className="flex shrink-0 items-center gap-8">
                  <span className="text-sm font-semibold whitespace-nowrap text-ink-muted">
                    {item}
                  </span>
                  <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
