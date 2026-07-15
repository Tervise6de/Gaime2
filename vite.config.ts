import { defineConfig, type Plugin } from "vite";
import { fileURLToPath, URL } from "node:url";

/**
 * Content-Security-Policy for the production build (injected as a <meta> so it
 * ships with the static bundle; skipped in dev so Vite's HMR websocket keeps
 * working). The game is a self-contained offline app, so the policy is tight:
 *
 *  - `script-src 'self'` (no 'unsafe-inline') → inline event handlers like a
 *    smuggled `onerror=` never execute — a hard second layer under the
 *    innerHTML escaping, should any sink ever be missed.
 *  - `connect-src 'self'` → same-origin only (the service worker re-fetches the
 *    app's own assets to cache them); no cross-origin call can phone home.
 *  - `worker-src 'self'` → the offline service worker; `manifest-src 'self'` →
 *    the web app manifest.
 *  - `img-src 'self' data:` → the canvas rasterises registry SVGs from data:
 *    URIs; `style-src` allows the inline style attributes the HUD sets.
 */
const CSP =
  "default-src 'self'; base-uri 'none'; object-src 'none'; " +
  "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; form-action 'none'";

function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</title>",
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [cspMeta()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    // The game is a single self-contained bundle with no runtime dependencies
    // and makes no network calls. Disable Vite's module-preload polyfill so the
    // built output contains no fetch() at all — nothing to preload, nothing to
    // phone home. (The rival AI is 100% local; see docs/game-design.md §5.)
    modulePreload: { polyfill: false },
  },
});
