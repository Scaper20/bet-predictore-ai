"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { MAINTENANCE_BYPASS_COOKIE, isMaintenanceExempt } from "@/lib/maintenance";

const POLL_MS = 30_000;

function bypassed(): boolean {
  return document.cookie.split("; ").includes(`${MAINTENANCE_BYPASS_COOKIE}=1`);
}

/**
 * Moves people who already have KiqStat open onto the maintenance page.
 *
 * The proxy blocks every new request while maintenance mode is on, but a tab
 * that's already loaded — signed in or not — would otherwise keep showing
 * the site (and keep polling live scores) until its next navigation. This
 * checks every 30 seconds and whenever the tab comes back into view, and
 * reloads the page once it's on; the reload is what the proxy then answers
 * with the maintenance page.
 *
 * Admins are let through by the proxy, which marks their browser with the
 * bypass cookie so this doesn't reload their page in a loop.
 */
export function MaintenanceWatcher() {
  const pathname = usePathname();
  const exempt = isMaintenanceExempt(pathname);

  useEffect(() => {
    if (exempt) return;
    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/site-status", { cache: "no-store" });
        if (!res.ok) return;
        const { maintenance } = (await res.json()) as { maintenance?: boolean };
        if (maintenance && !bypassed() && !stopped) {
          stopped = true;
          window.location.reload();
        }
      } catch {
        // Offline — nothing to do until the next check.
      }
    };

    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [exempt]);

  return null;
}
