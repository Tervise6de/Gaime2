/**
 * Main menu — the boot screen (docs/art-style.md; brief D1 "title / menu").
 *
 * Key art (TITLE_ART crest medallion) + wordmark over the usual game-shell
 * entries: Continue (or Begin), New game (expands the shared setup form from
 * ui/newgame.ts — identical to the HUD's), Options and Records (the HUD's own
 * overlays, raised above the menu while it is open). The game name is still
 * the "Gaime2" placeholder — it renders as DOM text so the eventual rename is
 * a copy edit, never an art change.
 *
 * Pure presentation: no sim access. Blocks the end-turn hotkey while up
 * (main.ts checks `.title-overlay`) and shields HUD shortcuts by stopping key
 * propagation; Escape chooses Continue.
 */

import { TITLE_ART } from "@/data/art";
import { isReduceMotion } from "@/ui/settings";
import { buildNewGameForm, type NewGameConfig } from "@/ui/newgame";

export interface MainMenuHooks {
  /** An autosave exists — label the primary entry "Continue". */
  hasSave: boolean;
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

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "title-overlay";

    const art = document.createElement("div");
    art.className = "title-art";
    art.setAttribute("aria-hidden", "true");
    art.innerHTML = keyArt;

    const wordmark = document.createElement("h1");
    wordmark.className = "title-wordmark";
    wordmark.textContent = "Gaime2";

    const tagline = document.createElement("p");
    tagline.className = "title-tagline";
    tagline.textContent = "Kingdom Management";

    const menu = document.createElement("div");
    menu.className = "title-menu";

    const primary = menuBtn(hooks.hasSave ? "Continue your reign" : "Begin your reign", "primary");
    primary.addEventListener("click", dismiss);

    // New game: expands the shared setup form inline, then starts + closes.
    const newGameBtn = menuBtn("New game");
    const setup = document.createElement("div");
    setup.className = "title-setup";
    setup.style.display = "none";
    const form = buildNewGameForm();
    const startBtn = menuBtn("Start", "primary title-start");
    startBtn.addEventListener("click", () => {
      hooks.onNewGame(form.readConfig());
      dismiss();
    });
    setup.append(...form.rows, startBtn);
    newGameBtn.addEventListener("click", () => {
      const open = setup.style.display !== "none";
      setup.style.display = open ? "none" : "block";
      newGameBtn.classList.toggle("open", !open);
    });

    const optionsBtn = menuBtn("Options");
    optionsBtn.addEventListener("click", () => hooks.onOpenOptions());
    const recordsBtn = menuBtn("Records");
    recordsBtn.addEventListener("click", () => hooks.onOpenRecords());

    menu.append(primary, newGameBtn, setup, optionsBtn, recordsBtn);

    const hint = document.createElement("p");
    hint.className = "title-hint";
    hint.textContent = "Esc to continue";

    overlay.append(art, wordmark, tagline, menu, hint);
    // Mount inside #hud so the HUD's own overlays (Options/Records, z 250 while
    // the menu is up) share this stacking context and can render above the menu
    // — #hud is position:fixed, which traps its children's z-index otherwise.
    (document.querySelector("#hud") ?? document.body).append(overlay);
    primary.focus();

    function dismiss(): void {
      window.removeEventListener("keydown", onKey, true);
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
      if (hudOverlayOpen()) return; // an overlay above the menu owns the keys (its Esc closes it)
      const target = ev.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "SELECT");
      if (ev.key === "Escape" && !typing) {
        ev.preventDefault();
        dismiss();
      }
      // Shield HUD shortcuts while the menu is topmost. Native input typing and
      // button activation are unaffected (no preventDefault beyond Escape).
      ev.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
  });
}

/** True while one of the HUD's shared overlays (Options/Records) is open. */
function hudOverlayOpen(): boolean {
  for (const o of document.querySelectorAll<HTMLElement>(".hud-techtree-overlay")) {
    if (o.style.display !== "none") return true;
  }
  return false;
}

function menuBtn(label: string, extra = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = ("title-menu-btn " + extra).trim();
  b.textContent = label;
  return b;
}
