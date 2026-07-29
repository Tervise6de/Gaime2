// @vitest-environment happy-dom
/**
 * The persisted display preferences.
 *
 * Small, but every one of them is a `try/catch` around `localStorage`, which is
 * the shape of code that silently stops working: a browser in private mode, a
 * blocked third-party context, or a quota error turns the setter into a no-op
 * and the getter has to have a sensible answer anyway. The defaults also carry
 * a product decision — the turn report, combat report and event notices are ON
 * unless the player has said otherwise, which reads as `!== "0"`, not `=== "1"`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  applyDisplaySettings,
  isColourblind,
  isCombatReport,
  isEventNotices,
  isReduceMotion,
  isTurnReport,
  setColourblind,
  setCombatReport,
  setEventNotices,
  setReduceMotion,
  setTurnReport,
} from "@/ui/settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-colourblind");
  document.documentElement.removeAttribute("data-reduce-motion");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defaults on a fresh install", () => {
  it("leaves the accessibility toggles off", () => {
    expect(isColourblind()).toBe(false);
    expect(isReduceMotion()).toBe(false);
  });

  it("leaves the things that explain the game ON", () => {
    // These are opt-*out*: a new player gets the turn report, the battle replay
    // and the historical event cards until they turn them off.
    expect(isTurnReport()).toBe(true);
    expect(isCombatReport()).toBe(true);
    expect(isEventNotices()).toBe(true);
  });
});

describe("round trips", () => {
  const pairs = [
    [isColourblind, setColourblind],
    [isReduceMotion, setReduceMotion],
    [isTurnReport, setTurnReport],
    [isCombatReport, setCombatReport],
    [isEventNotices, setEventNotices],
  ] as const;

  it("remembers both answers for every preference", () => {
    for (const [get, set] of pairs) {
      expect(set(true)).toBe(true);
      expect(get()).toBe(true);
      expect(set(false)).toBe(false);
      expect(get()).toBe(false);
    }
  });

  it("keeps preferences apart — setting one never moves another", () => {
    setColourblind(true);
    expect(isReduceMotion()).toBe(false);
    expect(isTurnReport()).toBe(true);
    setTurnReport(false);
    expect(isColourblind()).toBe(true);
  });
});

describe("when the store is unavailable", () => {
  /** Private browsing and blocked storage both throw rather than return null. */
  function breakStorage(): void {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
  }

  it("still answers, and still answers correctly", () => {
    breakStorage();
    expect(() => isColourblind()).not.toThrow();
    expect(isColourblind()).toBe(false);
    // ...and the opt-out preferences stay ON, which is the important half: a
    // player with blocked storage must not silently lose the tutorial reports.
    expect(isTurnReport()).toBe(true);
    expect(isCombatReport()).toBe(true);
    expect(isEventNotices()).toBe(true);
  });

  it("lets a setter fail without taking the click with it", () => {
    breakStorage();
    expect(() => setColourblind(true)).not.toThrow();
    expect(setTurnReport(false)).toBe(false); // reports the caller's intent
  });
});

describe("applyDisplaySettings", () => {
  it("reflects the toggles onto the root element for CSS to key off", () => {
    setColourblind(true);
    setReduceMotion(false);
    applyDisplaySettings();
    expect(document.documentElement.dataset.colourblind).toBe("1");
    expect(document.documentElement.dataset.reduceMotion).toBe("0");

    setReduceMotion(true);
    applyDisplaySettings();
    expect(document.documentElement.dataset.reduceMotion).toBe("1");
  });

  it("is safe to call when storage is broken", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => applyDisplaySettings()).not.toThrow();
    expect(document.documentElement.dataset.colourblind).toBe("0");
  });
});
