import { describe, expect, it } from "vitest";
import { DEFAULT_MAINTENANCE_MESSAGE, isMaintenanceExempt, maintenanceHtml } from "./maintenance";

describe("isMaintenanceExempt", () => {
  it("keeps the admin portal, auth callback, APIs and offline page reachable", () => {
    for (const path of ["/admin", "/admin/login", "/admin/maintenance", "/auth/callback", "/api/cron/push-daily", "/offline"]) {
      expect(isMaintenanceExempt(path)).toBe(true);
    }
  });

  it("keeps plain files reachable", () => {
    expect(isMaintenanceExempt("/robots.txt")).toBe(true);
    expect(isMaintenanceExempt("/sitemap.xml")).toBe(true);
  });

  it("blocks the public pages", () => {
    for (const path of ["/", "/fixtures", "/match/123", "/account", "/administrator", "/apis", "/pricing"]) {
      expect(isMaintenanceExempt(path)).toBe(false);
    }
  });
});

describe("maintenanceHtml", () => {
  it("falls back to the default message", () => {
    expect(maintenanceHtml(null)).toContain("we&#39;re making some major changes");
    expect(maintenanceHtml("   ")).toContain(DEFAULT_MAINTENANCE_MESSAGE.slice(0, 30));
  });

  it("escapes the admin's message", () => {
    const html = maintenanceHtml('<script>alert("x")</script> back at 6pm');
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; back at 6pm");
  });
});
