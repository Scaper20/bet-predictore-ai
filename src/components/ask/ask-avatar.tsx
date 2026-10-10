import { LogoMark } from "@/components/brand/logo";

/** Ask KiqStat's face in the panel and on match pages: the Q mark on a dark disc. */
export function AskAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "size-7" : size === "md" ? "size-8" : "size-11";
  const mark = size === "sm" ? "size-4" : size === "md" ? "size-[18px]" : "size-6";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full border border-line-strong bg-surface-3 text-ink ${box}`}
      aria-hidden
    >
      <LogoMark className={mark} />
    </span>
  );
}
