import { describe, it, expect, beforeEach } from "vitest";
import { t, setLocale, getLocale, isLocale, LOCALES, allKeys, catalogFor } from "@/ui/i18n";

describe("i18n scaffolding (D5)", () => {
  beforeEach(() => setLocale("en")); // deterministic baseline (module caches the locale)

  it("returns the English string for a known key", () => {
    expect(t("menu.newGame")).toBe("New game");
    expect(t("action.endTurn")).toBe("End turn ▶");
  });

  it("falls back to the key itself for an unknown key (visible, never a crash)", () => {
    expect(t("nope.not.a.key")).toBe("nope.not.a.key");
  });

  it("interpolates {name} placeholders", () => {
    expect(t("menu.discard", { turn: 7 })).toContain("7");
    expect(t("menu.discard", { turn: 7 })).not.toContain("{turn}");
  });

  it("leaves an unmatched placeholder intact rather than dropping it", () => {
    // menu.discard expects {turn}; passing nothing keeps the token verbatim.
    expect(t("menu.discard")).toContain("{turn}");
  });

  it("switches locale and translates", () => {
    setLocale("et");
    expect(getLocale()).toBe("et");
    expect(t("menu.newGame")).toBe("Uus mäng");
    expect(t("action.endTurn")).toBe("Lõpeta käik ▶");
  });

  it("falls back to English for a key a locale hasn't translated", () => {
    setLocale("et");
    // "menu.wordmark" is intentionally English-only (a brand); et falls back.
    expect(t("menu.wordmark")).toBe(t("menu.wordmark")); // no throw
    expect(t("menu.wordmark")).toBe("Hansa");
  });

  it("interpolation still works in a non-English locale", () => {
    setLocale("et");
    const s = t("menu.discard", { turn: 3 });
    expect(s).toContain("3");
    expect(s).not.toContain("{turn}");
  });

  it("guards the locale type", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("et")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("ships every advertised locale with a catalogue, and no orphan translations", () => {
    const english = new Set(allKeys());
    expect(english.size).toBeGreaterThan(0);
    for (const { id } of LOCALES) {
      const cat = catalogFor(id);
      expect(cat).toBeTruthy();
      // Every translated key must exist in the English reference (no orphan keys
      // that fall through to their own literal and never update with the source).
      for (const key of Object.keys(cat)) {
        expect(english.has(key), `${id} has an orphan key "${key}" not in English`).toBe(true);
      }
    }
  });

  it("English is the exhaustive reference (every locale is a subset)", () => {
    // en must define at least as many keys as any other locale.
    const enCount = allKeys().length;
    for (const { id } of LOCALES) {
      expect(Object.keys(catalogFor(id)).length).toBeLessThanOrEqual(enCount);
    }
  });
});
