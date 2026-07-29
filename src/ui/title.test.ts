// @vitest-environment happy-dom
/**
 * The main menu.
 *
 * It is a promise that gates the whole game — nothing renders until it
 * resolves — so the failure that matters is it never resolving, or resolving
 * without telling `main.ts` which game to start. It also carries the two-step
 * guard that stops a live game being discarded by one stray click, and the
 * version stamp the working agreement says must never go stale.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { showMainMenu, type MainMenuHooks } from "@/ui/title";
import type { NewGameConfig } from "@/ui/newgame";
import { createGame } from "@/systems/turn";
import { setReduceMotion } from "@/ui/settings";
import pkg from "../../package.json";

function hooks(over: Partial<MainMenuHooks> = {}): MainMenuHooks & { started: NewGameConfig[] } {
  const started: NewGameConfig[] = [];
  return {
    hasSave: false,
    liveGameTurn: null,
    onNewGame: (c) => started.push(c),
    onOpenOptions: () => undefined,
    onOpenRecords: () => undefined,
    started,
    ...over,
  };
}

function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  expect(el, `no ${selector}`).not.toBeNull();
  el!.click();
}

/** The menu's buttons carry their label as text; find one by what it says. */
function byLabel(text: RegExp): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""));
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("entering the game", () => {
  it("resolves when the player takes the primary entry", async () => {
    const h = hooks();
    const entered = showMainMenu(h);
    expect(document.querySelector(".title-overlay")).not.toBeNull();
    byLabel(/Begin|Continue/i)!.click();
    await expect(entered).resolves.toBeUndefined();
  });

  it("offers to continue when a save exists, and to begin when none does", async () => {
    const fresh = showMainMenu(hooks({ hasSave: false }));
    expect(byLabel(/Begin/i)).toBeDefined();
    byLabel(/Begin/i)!.click();
    await fresh;

    document.body.innerHTML = "";
    const saved = showMainMenu(hooks({ hasSave: true }));
    expect(byLabel(/Continue/i)).toBeDefined();
    byLabel(/Continue/i)!.click();
    await saved;
  });
});

describe("starting a new game", () => {
  it("hands main.ts a config it can actually start", async () => {
    const h = hooks();
    const entered = showMainMenu(h);
    click(".title-menu button:nth-child(2)"); // New game
    byLabel(/Start game/i)!.click();
    await entered;

    expect(h.started.length).toBe(1);
    const game = createGame(h.started[0]!);
    expect(game.regions.length).toBe(74);
  });

  it("clears itself off the screen afterwards, motion or no motion", async () => {
    // The menu covers the whole game, so a teardown that stalls leaves the
    // player staring at a dead title screen. Both paths are timed, so drive
    // the clock rather than waiting on it.
    vi.useFakeTimers();
    try {
      setReduceMotion(true);
      const quick = showMainMenu(hooks());
      byLabel(/Begin/i)!.click();
      await vi.advanceTimersByTimeAsync(200);
      await quick;
      expect(document.querySelector(".title-overlay")).toBeNull();

      setReduceMotion(false);
      const animated = showMainMenu(hooks());
      byLabel(/Begin/i)!.click();
      await vi.advanceTimersByTimeAsync(700);
      await animated;
      // Resolved, and on its way out...
      expect(document.querySelector(".title-overlay")?.classList.contains("leaving")).toBe(true);
      await vi.advanceTimersByTimeAsync(700);
      expect(document.querySelector(".title-overlay")).toBeNull();
    } finally {
      vi.useRealTimers();
      setReduceMotion(false);
    }
  });

  it("makes discarding a live game take two deliberate clicks", async () => {
    const h = hooks({ liveGameTurn: 42 });
    const entered = showMainMenu(h);
    click(".title-menu button:nth-child(2)");

    const start = byLabel(/Start game/i)!;
    start.click();
    // First click only arms it: nothing started, and the label now names the
    // turn that would be thrown away.
    expect(h.started.length).toBe(0);
    expect(start.classList.contains("armed")).toBe(true);
    expect(start.textContent).toContain("42");

    start.click();
    await entered;
    expect(h.started.length).toBe(1);
  });

  it("disarms the discard when the player backs out and returns", async () => {
    const h = hooks({ liveGameTurn: 7 });
    showMainMenu(h);
    click(".title-menu button:nth-child(2)");
    const start = byLabel(/Start game/i)!;
    start.click();
    expect(start.classList.contains("armed")).toBe(true);

    byLabel(/Back/i)!.click();
    click(".title-menu button:nth-child(2)");
    // Re-entering setup must not leave a primed "discard" under the cursor.
    expect(byLabel(/Start game/i)!.classList.contains("armed")).toBe(false);
    expect(h.started.length).toBe(0);
  });
});

describe("the menu's other doors", () => {
  it("opens Options and Records without leaving the menu", async () => {
    const options = vi.fn();
    const records = vi.fn();
    const h = hooks({ onOpenOptions: options, onOpenRecords: records });
    showMainMenu(h);
    byLabel(/Options/i)!.click();
    byLabel(/Records/i)!.click();
    expect(options).toHaveBeenCalledOnce();
    expect(records).toHaveBeenCalledOnce();
    // Still on the menu: neither is a way into the game.
    expect(document.querySelector(".title-overlay")).not.toBeNull();
  });
});

describe("the version stamp", () => {
  it("shows the real build number, so a forgotten bump is visible", () => {
    showMainMenu(hooks());
    const stamp = document.querySelector(".title-version")!.textContent ?? "";
    // In a test run Vite's define is absent, so the code falls back to "dev";
    // what this pins is that the element exists and reads a version at all.
    expect(stamp).toMatch(/^v\S+ · GAIME Studio$/);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
