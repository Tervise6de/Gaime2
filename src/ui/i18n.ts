/**
 * Localisation scaffolding (roadmap D5) — a tiny, dependency-free string
 * catalogue and lookup so UI copy can be translated without touching call sites.
 *
 * WHY UI-LAYER: strings are pure presentation and the locale is read from
 * `localStorage` (a browser API), so this lives in `ui/` and never in the sim —
 * `systems/` stay DOM- and locale-free (the guardrail in CLAUDE.md). It is also
 * environment-safe: with no `document` / `navigator` / `localStorage` (the Node
 * test env) it degrades to English, so importing it never throws.
 *
 * HOW TO USE: `t("menu.newGame")` returns the string in the active locale,
 * falling back to English for any key a locale hasn't translated, and to the key
 * itself if it is unknown (so a missing string is *visible*, never a crash).
 * Interpolate `{name}` placeholders: `t("menu.discard", { turn: 5 })`.
 *
 * HOW TO EXTEND (the point of a *scaffold*): add the key to `EN` (the complete
 * reference catalogue), switch the call site to `t("your.key")`, and — optionally
 * — add the translation to `ET` or a new locale. `EN` must stay exhaustive; other
 * locales may be partial and fall back. This module wires the boot screen and the
 * top-bar navigation as a worked example; the rest of the HUD migrates the same
 * way, key by key, with no engine changes.
 */

export type Locale = "en" | "et";

/** Selectable locales, in display order (for the Options language picker). */
export const LOCALES: readonly { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "et", label: "Eesti" },
];

type Catalog = Record<string, string>;

/** English — the complete reference catalogue. Every key the UI uses lives here. */
const EN: Catalog = {
  // Boot screen (ui/title.ts)
  "menu.studio": "GAIME Studio",
  "menu.wordmark": "Hansa",
  "menu.continue": "Continue your reign",
  "menu.begin": "Begin your reign",
  "menu.newGame": "New game",
  "menu.options": "Options",
  "menu.records": "Records",
  "menu.startGame": "Start game ▶",
  "menu.loading": "Charting the merchant sea...",
  "menu.back": "← Back",
  "menu.escContinue": "Esc to continue",
  "menu.escBack": "Esc to go back",
  "menu.discard": "Discard your turn {turn} game — start over?",
  // Top-bar navigation rail (ui/hud.ts)
  "nav.diplomacy": "Diplomacy",
  "nav.diplomacy.tip": "Relations, treaties and offers. Shortcut: D",
  "nav.research": "Research",
  "nav.research.tip": "Technology and research. Shortcut: R",
  "nav.production": "Production",
  "nav.production.tip": "Every region's construction — and the idle ones. Shortcut: B",
  "nav.armies": "Armies",
  "nav.armies.tip": "All your armies — strength, readiness, and move orders. Shortcut: A",
  "nav.politics": "Politics",
  "nav.politics.tip": "Taxes, fiscal policy and victory progress. Shortcut: P",
  "action.endTurn": "End turn ▶",
  // Options (the language picker's own label — ui/hud.ts options panel)
  "options.language": "Language",
};

/** Estonian — a partial locale; any key it omits falls back to English. */
const ET: Catalog = {
  "menu.continue": "Jätka valitsemist",
  "menu.begin": "Alusta valitsemist",
  "menu.newGame": "Uus mäng",
  "menu.options": "Seaded",
  "menu.records": "Rekordid",
  "menu.startGame": "Alusta mängu ▶",
  "menu.loading": "Kaardistame kaupmeeste merd...",
  "menu.back": "← Tagasi",
  "menu.escContinue": "Esc jätkamiseks",
  "menu.escBack": "Esc tagasi",
  "menu.discard": "Loobu käigu {turn} mängust — alustada otsast peale?",
  "nav.diplomacy": "Diplomaatia",
  "nav.diplomacy.tip": "Suhted, lepingud ja pakkumised. Otsetee: D",
  "nav.research": "Teadus",
  "nav.research.tip": "Tehnoloogia ja uurimistöö. Otsetee: R",
  "nav.production": "Tootmine",
  "nav.production.tip": "Iga piirkonna ehitus — ja jõude seisvad. Otsetee: B",
  "nav.armies": "Väed",
  "nav.armies.tip": "Kõik su väed — tugevus, valmisolek ja käsud. Otsetee: A",
  "nav.politics": "Poliitika",
  "nav.politics.tip": "Maksud, rahanduspoliitika ja võiduedu. Otsetee: P",
  "action.endTurn": "Lõpeta käik ▶",
  "options.language": "Keel",
};

const CATALOGS: Record<Locale, Catalog> = { en: EN, et: ET };

const LOCALE_KEY = "gaime2:locale";
let current: Locale | null = null;

/** Whether `v` names a locale we ship. */
export function isLocale(v: string | null | undefined): v is Locale {
  return v === "en" || v === "et";
}

/** The active locale — the persisted choice, else the browser's, else English. */
export function getLocale(): Locale {
  if (current) return current;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LOCALE_KEY);
  } catch {
    /* storage unavailable — fall through to the browser / default */
  }
  if (isLocale(stored)) return (current = stored);
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  current = isLocale(nav) ? nav : "en";
  return current;
}

/** Choose the active locale, persist it, and reflect it on `<html lang>`. */
export function setLocale(loc: Locale): void {
  current = loc;
  try {
    localStorage.setItem(LOCALE_KEY, loc);
  } catch {
    /* storage unavailable — the choice just won't persist */
  }
  if (typeof document !== "undefined") document.documentElement.lang = loc;
}

/** Reflect the active locale on `<html lang>` at boot (called once from main.ts). */
export function applyLocale(): void {
  if (typeof document !== "undefined") document.documentElement.lang = getLocale();
}

/**
 * The string for `key` in the active locale — falling back to English for an
 * untranslated key, and to the key itself for an unknown one. `{name}`
 * placeholders are filled from `params`.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const loc = getLocale();
  const s = CATALOGS[loc]?.[key] ?? EN[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Every key the reference (English) catalogue defines — for tests and tooling. */
export function allKeys(): string[] {
  return Object.keys(EN);
}

/** The raw catalogue for `loc` — for tests that check translation coverage. */
export function catalogFor(loc: Locale): Catalog {
  return CATALOGS[loc];
}
