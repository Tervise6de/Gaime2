// @vitest-environment happy-dom
/**
 * The confirmation dialog.
 *
 * It stands in front of every irreversible act — declaring war, abandoning a
 * game in progress, clearing a save — and it is a promise, so the ways it can
 * go wrong are quiet ones: resolving twice, resolving never, leaving a keydown
 * listener behind that swallows the next Escape, or letting a caller's text
 * become markup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { confirmAction } from "@/ui/confirm";

const OPTS = { title: "Declare war?", body: "This cannot be undone." };

function panel(): HTMLElement | null {
  return document.querySelector(".confirm-overlay");
}
function button(kind: "cancel" | "primary" | "danger"): HTMLButtonElement {
  return document.querySelector(`.confirm-btn.${kind}`)!;
}
function key(k: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("confirmAction", () => {
  it("resolves true on confirm and tidies up after itself", async () => {
    const answer = confirmAction(OPTS);
    expect(panel()).not.toBeNull();
    button("primary").click();
    expect(await answer).toBe(true);
    expect(panel()).toBeNull();
  });

  it("resolves false on cancel", async () => {
    const answer = confirmAction(OPTS);
    button("cancel").click();
    expect(await answer).toBe(false);
    expect(panel()).toBeNull();
  });

  it("takes Escape as no and Enter as yes", async () => {
    const no = confirmAction(OPTS);
    key("Escape");
    expect(await no).toBe(false);

    const yes = confirmAction(OPTS);
    key("Enter");
    expect(await yes).toBe(true);
  });

  it("cancels when the backdrop is clicked, but not the panel itself", async () => {
    const answer = confirmAction(OPTS);
    // A click inside the panel must not dismiss it.
    document.querySelector<HTMLElement>(".confirm-panel")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(panel()).not.toBeNull();
    // The backdrop does.
    panel()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(await answer).toBe(false);
  });

  it("takes its key listener with it", async () => {
    // A leaked handler is invisible from the outside — the stale dialog's
    // `close` is idempotent, so the next Escape still looks right while the
    // listeners pile up one per dialog for the rest of the session. Counting
    // the registrations is the only way to see it.
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const keydowns = (spy: typeof added): number =>
      spy.mock.calls.filter(([type]) => type === "keydown").length;

    for (const answer of [() => button("primary").click(), () => key("Escape")]) {
      const dialog = confirmAction(OPTS);
      answer();
      await dialog;
    }
    expect(keydowns(added)).toBe(2);
    expect(keydowns(removed)).toBe(2); // every one taken back down again
  });

  it("refuses to stack — a second dialog answers no rather than burying the first", async () => {
    const first = confirmAction(OPTS);
    expect(await confirmAction({ title: "Another", body: "?" })).toBe(false);
    // ...and the first is still standing and still answerable.
    expect(document.querySelectorAll(".confirm-overlay").length).toBe(1);
    button("cancel").click();
    expect(await first).toBe(false);
  });

  it("sets the caller's words as text, never as markup", async () => {
    const answer = confirmAction({
      title: "<b>War</b>",
      body: '<img src=x onerror="boom">',
    });
    const overlay = panel()!;
    expect(overlay.querySelector("b")).toBeNull();
    expect(overlay.querySelector("img")).toBeNull();
    expect(overlay.textContent).toContain("<b>War</b>");
    button("cancel").click();
    await answer;
  });

  it("wears the danger style only when asked", async () => {
    const plain = confirmAction(OPTS);
    expect(document.querySelector(".confirm-btn.primary")).not.toBeNull();
    button("cancel").click();
    await plain;

    const risky = confirmAction({ ...OPTS, danger: true, confirmLabel: "Burn it" });
    expect(button("danger").textContent).toBe("Burn it");
    button("danger").click();
    expect(await risky).toBe(true);
  });
});
