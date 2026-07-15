/**
 * Title screen — the boot splash (docs/art-style.md; brief D1 "title / menu").
 *
 * Pure presentation: key art (TITLE_ART crest medallion), a styled wordmark,
 * and one button that dismisses into the normal boot flow. The game name is
 * still the "Gaime2" placeholder — it renders as DOM text so the eventual
 * rename is a copy edit, never an art change. Respects reduce-motion (no
 * fade), blocks the end-turn hotkey while up (main.ts checks `.title-overlay`)
 * and swallows its own keys so shortcuts don't fire behind it.
 */

import { TITLE_ART } from "@/data/art";
import { isReduceMotion } from "@/ui/settings";

/** Show the splash; resolves when the player begins. No-ops without art. */
export function showTitleScreen(hasSave: boolean): Promise<void> {
  const keyArt = TITLE_ART;
  if (!keyArt) return Promise.resolve(); // registry fallback: boot straight in

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

    const begin = document.createElement("button");
    begin.className = "title-begin";
    begin.textContent = hasSave ? "Continue your reign" : "Begin your reign";

    const hint = document.createElement("p");
    hint.className = "title-hint";
    hint.textContent = "Enter to begin";

    overlay.append(art, wordmark, tagline, begin, hint);
    document.body.append(overlay);
    begin.focus();

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

    // Capture phase so HUD shortcuts (L/H/S/M, end-turn) never fire behind us.
    function onKey(ev: KeyboardEvent): void {
      ev.stopPropagation();
      if (ev.key === "Enter" || ev.key === " " || ev.key === "Escape") {
        ev.preventDefault();
        dismiss();
      }
    }
    window.addEventListener("keydown", onKey, true);
    begin.addEventListener("click", dismiss);
  });
}
