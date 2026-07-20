/**
 * Main menu — the boot screen (docs/art-style.md; brief D1 "title / menu").
 *
 * Key art (TITLE_ART crest medallion) + wordmark over the usual game-shell
 * entries: Continue (or Begin), New game (expands the shared setup form from
 * ui/newgame.ts — identical to the HUD's), Options and Records (the HUD's own
 * overlays, raised above the menu while it is open). The wordmark
 * ("Sea of Coin") renders as DOM text, so a rename stays a copy edit rather
 * than an art change.
 *
 * Pure presentation: no sim access. The end-turn hotkey is blocked by main.ts's
 * `modalOpen()` `.title-overlay` check (load-bearing — main.ts's listener is a
 * capture listener registered before this one, so our `stopPropagation` cannot
 * stop it); we additionally stop propagation to shield the HUD's bubble-phase
 * shortcuts and trap Tab focus inside the overlay. Escape chooses Continue.
 */

import { TITLE_ART } from "@/data/art";
import { isReduceMotion } from "@/ui/settings";
import { t } from "@/ui/i18n";
import { buildNewGameForm, type NewGameConfig } from "@/ui/newgame";

const LOADING_ART = [
  "/key-art/loading-map-table.jpg",
  "/key-art/loading-harbor-dark.jpg",
  "/key-art/loading-cog-arrival.jpg",
] as const;

export interface MainMenuHooks {
  /** An autosave exists — label the primary entry "Continue". */
  hasSave: boolean;
  /** A live, unfinished game is loaded — starting fresh needs confirmation. */
  liveGameTurn: number | null;
  /** Start a fresh game with the chosen setup (menu closes afterwards). */
  onNewGame(config: NewGameConfig): void;
  /** Open the HUD's Options overlay (renders above the menu). */
  onOpenOptions(): void;
  /** Open the HUD's Records overlay (renders above the menu). */
  onOpenRecords(): void;
}

/** Show the main menu; resolves when the player enters the game. */
export function showMainMenu(hooks: MainMenuHooks): Promise<void> {
  if (!TITLE_ART) return Promise.resolve(); // registry fallback: boot straight in
  const keyArt = TITLE_ART;
  preloadKeyArt();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "title-overlay";
    setLoadingArt(overlay, 0);

    const art = document.createElement("div");
    art.className = "title-art";
    art.setAttribute("aria-hidden", "true");
    art.innerHTML = keyArt;

    // Studio credit above the wordmark; the version sits in the corner below.
    const studio = document.createElement("p");
    studio.className = "title-studio";
    studio.textContent = t("menu.studio");

    const wordmark = document.createElement("h1");
    wordmark.className = "title-wordmark";
    wordmark.textContent = t("menu.wordmark");

    const version = document.createElement("p");
    version.className = "title-version";
    version.textContent =
      `v${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"} · GAIME Studio`;

    const loading = document.createElement("div");
    loading.className = "title-loading";
    loading.setAttribute("aria-live", "polite");
    const loadingMark = document.createElement("div");
    loadingMark.className = "title-loading-mark";
    loadingMark.textContent = t("menu.wordmark");
    const loadingText = document.createElement("div");
    loadingText.className = "title-loading-text";
    loadingText.textContent = t("menu.loading");
    const loadingBar = document.createElement("div");
    loadingBar.className = "title-loading-bar";
    loading.append(loadingMark, loadingText, loadingBar);

    // Two screens sharing the column: the main list, and the New-game setup
    // that *replaces* it (Start game ▶ / ← Back) — never both at once.
    const menu = document.createElement("div");
    menu.className = "title-menu";

    const primary = menuBtn(hooks.hasSave ? t("menu.continue") : t("menu.begin"), "primary");
    primary.addEventListener("click", () => dismiss());

    const newGameBtn = menuBtn(t("menu.newGame"));
    const optionsBtn = menuBtn(t("menu.options"));
    optionsBtn.addEventListener("click", () => hooks.onOpenOptions());
    const recordsBtn = menuBtn(t("menu.records"));
    recordsBtn.addEventListener("click", () => hooks.onOpenRecords());
    menu.append(primary, newGameBtn, optionsBtn, recordsBtn);

    const setup = document.createElement("div");
    setup.className = "title-setup";
    setup.style.display = "none";
    const setupHead = document.createElement("div");
    setupHead.className = "title-setup-head";
    setupHead.textContent = t("menu.newGame");
    const form = buildNewGameForm();
    const startBtn = menuBtn(t("menu.startGame"), "primary title-start");
    // Guard against discarding a live game with a mis-click: the first Start
    // arms an inline confirm (no separate dialog — that would sit under this
    // opaque overlay), the second starts. Fresh boots start immediately.
    let armed = false;
    function disarmStart(): void {
      armed = false;
      startBtn.textContent = t("menu.startGame");
      startBtn.classList.remove("armed");
    }
    startBtn.addEventListener("click", () => {
      if (hooks.liveGameTurn !== null && !armed) {
        armed = true;
        startBtn.textContent = t("menu.discard", { turn: hooks.liveGameTurn });
        startBtn.classList.add("armed");
        return;
      }
      const config = form.readConfig();
      setLoadingArt(overlay, config.seed);
      hooks.onNewGame(config);
      dismiss();
    });
    const backBtn = menuBtn(t("menu.back"));
    backBtn.addEventListener("click", () => showSetup(false));
    setup.append(setupHead, ...form.rows, startBtn, backBtn);
    newGameBtn.addEventListener("click", () => showSetup(true));

    const hint = document.createElement("p");
    hint.className = "title-hint";
    hint.textContent = t("menu.escContinue");
    let closing = false;

    function showSetup(open: boolean): void {
      menu.style.display = open ? "none" : "flex";
      setup.style.display = open ? "flex" : "none";
      hint.textContent = open ? t("menu.escBack") : t("menu.escContinue");
      overlay.scrollTop = 0; // a fresh screen always starts at its top
      if (open) {
        form.refreshSeed(); // every visit to the setup gets a fresh, real seed
        disarmStart();
        startBtn.focus();
      } else {
        newGameBtn.focus();
      }
    }

    overlay.append(art, studio, wordmark, menu, setup, hint, version, loading);
    // Mount inside #hud so the HUD's own overlays (Options/Records, z 250 while
    // the menu is up) share this stacking context and can render above the menu
    // — #hud is position:fixed, which traps its children's z-index otherwise.
    // The marker class (instead of a :has() selector) keeps style recalc cheap:
    // :has() over the whole HUD re-evaluated on every DOM mutation.
    const hudRoot = document.querySelector("#hud") ?? document.body;
    hudRoot.classList.add("title-open");
    hudRoot.append(overlay);
    primary.focus();

    function dismiss(): void {
      if (closing) return;
      closing = true;
      window.removeEventListener("keydown", onKey, true);
      hudRoot.classList.remove("title-open");
      overlay.classList.add("loading");
      window.setTimeout(finishDismiss, isReduceMotion() ? 90 : 620);
    }

    function finishDismiss(): void {
      if (isReduceMotion()) {
        overlay.remove();
      } else {
        overlay.classList.add("leaving");
        overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
        // Safety net if the transition never fires (display: none ancestors etc.).
        window.setTimeout(() => overlay.remove(), 600);
      }
      resolve();
    }

    // Capture phase: shield the HUD's shortcuts (L/H/S/M, end-turn) while the
    // menu is up, without breaking typing in the seed input or native button
    // activation. Escape = Continue, but never while a HUD overlay (Options /
    // Records) is open above us — Esc belongs to that overlay then.
    function onKey(ev: KeyboardEvent): void {
      if (hudOverlayOpen()) return; // Options/Records above the menu owns the keys (its Esc closes it)
      const target = ev.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "SELECT");
      if (ev.key === "Escape" && !typing) {
        ev.preventDefault();
        // In the setup screen, Esc steps back to the menu; from the menu it continues.
        if (setup.style.display !== "none") showSetup(false);
        else dismiss();
      } else if (ev.key === "Tab") {
        // Focus trap: keep Tab inside the overlay so it can never reach (and
        // Enter-activate) the live HUD controls hidden behind this opaque menu.
        trapFocus(overlay, ev);
      }
      // Shield HUD shortcuts while the menu is topmost. Native input typing and
      // button activation are unaffected (no preventDefault beyond Escape/Tab).
      ev.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
  });
}

/**
 * True while the HUD's Options or Records overlay is open — the only overlays
 * the menu itself raises above the splash. A stale choice/end-game overlay from
 * the loaded save is deliberately *not* counted: it sits behind the menu, so
 * the menu keeps ownership of Escape until the player enters the game.
 */
function hudOverlayOpen(): boolean {
  for (const o of document.querySelectorAll<HTMLElement>(".hud-techtree-overlay")) {
    if (o.style.display === "none") continue;
    if (o.querySelector(".hud-options-panel, .hud-records-panel")) return true;
  }
  return false;
}

/** Cycle Tab focus within `container`'s focusable elements (wraps at the ends). */
function trapFocus(container: HTMLElement, ev: KeyboardEvent): void {
  const focusable = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  const items = Array.from(focusable).filter((el) => el.offsetParent !== null);
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (ev.shiftKey && (active === first || !container.contains(active))) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && (active === last || !container.contains(active))) {
    ev.preventDefault();
    first.focus();
  }
}

function setLoadingArt(overlay: HTMLElement, seed: number): void {
  const idx = Math.abs(seed) % LOADING_ART.length;
  overlay.style.setProperty("--title-loading-image", `url("${LOADING_ART[idx]}")`);
}

function preloadKeyArt(): void {
  if (typeof Image === "undefined") return;
  for (const src of ["/key-art/main-harbor.jpg", ...LOADING_ART]) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}

function menuBtn(label: string, extra = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = ("title-menu-btn " + extra).trim();
  b.textContent = label;
  return b;
}
