/**
 * PWA constants shared by the root layout (a Server Component) and the client
 * install UI. Kept out of a "use client" module on purpose: a server
 * component importing a plain string from one gets a client reference, not
 * the string.
 */

/** Fired on window when the menu's "Install the app" row is tapped. */
export const OPEN_INSTALL_EVENT = "bx:install";
/** Fired when Chrome's deferred install prompt becomes available. */
export const INSTALLABLE_EVENT = "bx:installable";

/**
 * Inlined at the top of <body>: Chrome fires `beforeinstallprompt` once, often
 * before the deferred install UI has loaded, so it is caught here into
 * window.__bxInstallEvent for components/pwa/install-prompt.tsx to replay.
 */
export const INSTALL_CAPTURE_SCRIPT = `
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__bxInstallEvent = e;
    window.dispatchEvent(new Event('${INSTALLABLE_EVENT}'));
  });
  window.addEventListener('appinstalled', function () { window.__bxInstallEvent = null; });
`;
