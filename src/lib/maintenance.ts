/**
 * Maintenance mode — the "we're making major changes" blocker that an admin
 * switches on from /admin/maintenance (stored in public.site_settings).
 *
 * Pure helpers only, so the proxy can import them without pulling in
 * anything server-only: which paths stay reachable, and the page itself.
 */

export const DEFAULT_MAINTENANCE_MESSAGE =
  "Sorry for the inconvenience — we're making some major changes to KiqStat. We'll be live again soon.";

export const MAINTENANCE_MESSAGE_MAX = 500;

/** Set by the proxy on an admin's browser while it lets them through maintenance. */
export const MAINTENANCE_BYPASS_COOKIE = "bx_maint_bypass";

/**
 * Paths that keep working while the site is blocked:
 * - /admin, so the switch can be flipped back (and /admin/login reached);
 * - /auth, the OAuth callback an admin signing in with Google returns to;
 * - /api, because the crons, the Paystack webhook and push keep running —
 *   nobody can click into the site to use the rest of it anyway;
 * - /offline, which the service worker precaches on install;
 * - plain files (robots.txt, sitemap.xml, llms.txt, ...).
 */
export function isMaintenanceExempt(pathname: string): boolean {
  if (/^\/(admin|auth|api|offline)(\/|$)/.test(pathname)) return true;
  return /\.[a-z0-9]+$/i.test(pathname);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The whole maintenance page as one self-contained HTML document.
 *
 * Served straight from the proxy rather than rewritten to an app route, so
 * it can go out as a real 503 (search engines then treat the outage as
 * temporary instead of indexing this page in place of the real ones) and
 * doesn't depend on any of the app that's mid-change. The only outside
 * asset is the logo under /brand, which the proxy matcher never touches.
 */
export function maintenanceHtml(message: string | null | undefined): string {
  const body = escapeHtml(message?.trim() || DEFAULT_MAINTENANCE_MESSAGE);
  return `<!doctype html>
<html lang="en-NG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#07090b">
<title>KiqStat · Back soon</title>
<link rel="icon" href="/icon.png">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: grid; place-items: center; padding: 24px 16px;
    background: radial-gradient(60rem 30rem at 50% -10%, rgba(212, 255, 58, 0.08), transparent 70%), #07090b;
    color: #f2f4ec;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main {
    width: 100%; max-width: 30rem; text-align: center;
    padding: 40px 28px; border: 1px solid #1e2723; border-radius: 20px; background: #0f1513;
  }
  img { width: 176px; height: auto; }
  .tag {
    display: inline-block; margin-top: 20px; padding: 4px 12px; border-radius: 999px;
    border: 1px solid rgba(255, 176, 32, 0.3); background: rgba(255, 176, 32, 0.12);
    color: #ffb020; font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
  }
  h1 { margin: 16px 0 0; font-size: 28px; line-height: 1.15; letter-spacing: -0.01em; }
  p { margin: 14px 0 0; color: #97a39c; font-size: 15px; line-height: 1.6; white-space: pre-line; }
  .small { margin-top: 24px; font-size: 13px; color: #6b7670; }
  a { color: #d4ff3a; }
</style>
</head>
<body>
<main>
  <img src="/brand/lockup.svg" alt="KiqStat" width="176" height="44">
  <div class="tag">Under maintenance</div>
  <h1>KiqStat will be back soon</h1>
  <p>${body}</p>
  <p class="small">Thanks for your patience. This page reloads by itself the moment we're back.</p>
</main>
<script>
  // Checks every 30s whether maintenance is over, and brings the visitor
  // straight back to the page they were on.
  setInterval(function () {
    fetch("/api/site-status", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { if (s && s.maintenance === false) location.reload(); })
      .catch(function () {});
  }, 30000);
</script>
</body>
</html>`;
}
