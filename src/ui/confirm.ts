/**
 * Reusable confirmation dialog for irreversible / heavy actions (declare war,
 * abandon a game in progress, clear a save slot). Pure DOM over the HUD; resolves
 * a promise with the player's choice. Content is set as text nodes (never
 * innerHTML) so a caller's message can't inject markup.
 */

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
}

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(".confirm-overlay")) {
      resolve(false); // one dialog at a time
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    const panel = document.createElement("div");
    panel.className = "confirm-panel";

    const h = document.createElement("h3");
    h.className = "confirm-title";
    h.textContent = opts.title;
    const p = document.createElement("p");
    p.className = "confirm-body";
    p.textContent = opts.body;

    const row = document.createElement("div");
    row.className = "confirm-actions";
    const cancel = document.createElement("button");
    cancel.className = "confirm-btn cancel";
    cancel.textContent = opts.cancelLabel ?? "Cancel";
    const ok = document.createElement("button");
    ok.className = "confirm-btn " + (opts.danger ? "danger" : "primary");
    ok.textContent = opts.confirmLabel ?? "Confirm";

    function close(v: boolean): void {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(v);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    }

    cancel.onclick = () => close(false);
    ok.onclick = () => close(true);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false); // backdrop cancels
    });
    document.addEventListener("keydown", onKey);

    row.append(cancel, ok);
    panel.append(h, p, row);
    overlay.append(panel);
    document.body.append(overlay);
    ok.focus();
  });
}
