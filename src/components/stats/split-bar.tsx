import { percent } from "@/lib/format";

/**
 * Home / draw / away as one bar split three ways, each segment growing in
 * after the one before. The leading outcome is brand green; the others
 * recede, so the read is visible before any number is.
 */
export function SplitBar({
  home,
  draw,
  away,
  labels = true,
  size = "md",
}: {
  home: number;
  draw: number;
  away: number;
  labels?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const top = Math.max(home, draw, away);
  const h = size === "lg" ? "h-2.5" : size === "sm" ? "h-1.5" : "h-2";
  const parts = [
    { key: "1", v: home, tone: home === top ? "bg-brand" : "bg-ink-dim/45" },
    { key: "X", v: draw, tone: draw === top ? "bg-brand" : "bg-ink-dim/25" },
    { key: "2", v: away, tone: away === top ? "bg-brand" : "bg-ink-dim/45" },
  ];
  return (
    <div className="w-full">
      <div className={`flex ${h} w-full gap-0.5 overflow-hidden rounded-full`} aria-hidden>
        {parts.map((p, i) => (
          <span
            key={p.key}
            className={`seg-grow block h-full ${p.tone} ${i === 0 ? "rounded-l-full" : ""} ${i === 2 ? "rounded-r-full" : ""}`}
            style={{ width: `${Math.max(p.v * 100, 2)}%`, animationDelay: `${i * 110}ms` }}
          />
        ))}
      </div>
      {labels && (
        <div className="mt-1.5 grid grid-cols-3 text-[11px]">
          {parts.map((p, i) => (
            <span
              key={p.key}
              className={`tnum ${i === 1 ? "text-center" : i === 2 ? "text-right" : ""} ${p.v === top ? "font-bold text-brand" : "text-ink-muted"}`}
            >
              <span className="text-ink-dim">{p.key} </span>
              {percent(p.v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
