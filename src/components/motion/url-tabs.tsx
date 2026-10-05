"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidingTabs, type SlidingTab } from "./sliding-tabs";

/** SlidingTabs whose choice is a URL (a day, a venue), for server-rendered pages. */
export function UrlTabs({
  tabs,
  value,
  ariaLabel,
  className,
}: {
  tabs: (SlidingTab & { href: string })[];
  value: string;
  ariaLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={`transition-opacity duration-300 ${pending ? "opacity-60" : ""}`}>
      <SlidingTabs
        ariaLabel={ariaLabel}
        value={value}
        className={className}
        tabs={tabs}
        onChange={(key) => {
          const t = tabs.find((x) => x.key === key);
          if (t) start(() => router.push(t.href, { scroll: false }));
        }}
      />
    </div>
  );
}
