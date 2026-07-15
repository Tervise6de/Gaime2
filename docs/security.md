# Security model & review

Petty Kingdoms is a **100% client-side, offline** browser game: no backend, no
accounts, no network calls. That shrinks the attack surface to a single class of
untrusted input, plus the usual web hardening.

## Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| The player's browser session | **DOM XSS** from a crafted/shared **save file** (imported JSON or a tampered `localStorage` entry) whose fields flow into `innerHTML`/markup | All save-derived strings are escaped at every `innerHTML` sink; colours pass through `safeColor()`; `deserializeGame` coerces `seed`→number and whitelists `difficulty`. A strict production **CSP** (`script-src 'self'`) blocks inline event handlers as a second layer. |
| "Runs offline / makes zero network calls" guarantee | A regression that introduces a network call | Build asserts `grep -c 'fetch(' dist/…` == 0; CSP `connect-src 'none'` blocks fetch/XHR/websocket/beacon at the browser. |
| Supply chain | Malicious/ vulnerable dependency shipped to users | Runtime `dependencies: {}` — nothing third-party ships. Build tooling is dev-only. |

Out of scope: there is no server, no auth, no PII, no payments, and saves are
the player's own local data — so there is nothing to steal server-side and no
multi-user trust boundary. A malicious save can at worst target the machine that
loads it (hence the XSS hardening); it cannot reach other players.

## Content-Security-Policy (production build)

Injected as a `<meta>` at build time (see `vite.config.ts`; skipped in dev so
HMR works):

```
default-src 'self'; base-uri 'none'; object-src 'none';
script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'none'; form-action 'none'
```

- `script-src 'self'` (no `'unsafe-inline'`) — inline handlers like a smuggled
  `onerror=` never execute. The built HTML has no inline `<script>`, so this
  costs nothing.
- `connect-src 'none'` — enforces the no-network guarantee in the browser.
- `img-src 'self' data:` — the canvas rasterises registry SVGs from `data:`
  URIs. `style-src 'unsafe-inline'` covers the inline style attributes the HUD
  sets (e.g. legend swatches); no inline scripts rely on it.

## Review log

**2026-07-15 — full-codebase security pass.** Enumerated sinks
(`eval`/`Function`/`document.write`/`insertAdjacentHTML` — none present),
network/exfil paths (only `data:` SVG images via `new Image()`, a non-scripting
context), and every `innerHTML` sink's data provenance.

Found and fixed one real **DOM XSS**: `nation.color` from an imported save was
substituted unsanitised into the crest SVG (`fill="__C__"`) and set via
`innerHTML` in the standings/diplomacy panels — a payload like
`"><img onerror=…>` executed. Fixed by validating colour in `safeColor()` (used
by `crestSvg` and every save-derived colour sink) and by adding the CSP above.
Reproduced the exploit in a headless browser (title changed to "CRESTPWN"),
then confirmed the fix neutralises it and that normal play raises zero CSP
violations. Unit tests cover `safeColor` and hostile-colour crest rendering.

(A prior pass had already fixed the name/seed/difficulty `innerHTML` sinks; this
pass closed the colour sink it missed.)

**Known, accepted:** `npm audit` reports a moderate/high advisory in **esbuild**
via **Vite** — it affects only the *dev server* (`npm run dev`), not the static
production bundle or players, and the only remediation is a breaking Vite 5→8
upgrade. Tracked as a deliberate maintenance upgrade, not a user-facing risk.
Low-severity: loading a deliberately corrupted save (e.g. an unknown trait id)
can throw during an HUD render — annoying, not a breach; broad field validation
is a future hardening.

## Reporting

Found something? Open a private report to the maintainers (GAIME) before public
disclosure.
