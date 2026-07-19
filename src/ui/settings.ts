/**
 * Persisted display/accessibility preferences that aren't audio (those live in
 * `ui/audio.ts`). Kept tiny and framework-free: each preference is a localStorage
 * key with a typed getter/setter. `applyDisplaySettings()` reflects the toggles
 * onto the document root as data-attributes so CSS (and later B4/B5 features) can
 * react. UI-only — never touches the sim.
 */

const COLOURBLIND_KEY = "gaime2:colourblind";
const REDUCE_MOTION_KEY = "gaime2:reduceMotion";
const TURN_REPORT_KEY = "gaime2:turnReport";

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeBool(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

/** Colourblind-safe palette preference (the palette swap itself lands in B4). */
export function isColourblind(): boolean {
  return readBool(COLOURBLIND_KEY);
}

export function setColourblind(v: boolean): boolean {
  writeBool(COLOURBLIND_KEY, v);
  applyDisplaySettings();
  return v;
}

/** Reduce-motion preference: honoured now by disabling UI transitions. */
export function isReduceMotion(): boolean {
  return readBool(REDUCE_MOTION_KEY);
}

export function setReduceMotion(v: boolean): boolean {
  writeBool(REDUCE_MOTION_KEY, v);
  applyDisplaySettings();
  return v;
}

/**
 * Turn report: pause after each End turn with a digest of what changed, so
 * play stays followable. On by default; quiet turns never show one.
 */
export function isTurnReport(): boolean {
  try {
    return localStorage.getItem(TURN_REPORT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setTurnReport(v: boolean): boolean {
  try {
    localStorage.setItem(TURN_REPORT_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable — preference just won't persist */
  }
  return v;
}

const COMBAT_REPORT_KEY = "gaime2:combatReport";

/** Combat report: replay a battle blow-by-blow when you attack. On by default. */
export function isCombatReport(): boolean {
  try {
    return localStorage.getItem(COMBAT_REPORT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setCombatReport(v: boolean): boolean {
  try {
    localStorage.setItem(COMBAT_REPORT_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable — preference just won't persist */
  }
  return v;
}

const EVENT_NOTICES_KEY = "gaime2:eventNotices";

/**
 * Epoch-event notifications: a card when a dated historical event (plague, the
 * herring monopoly, a lost Kontor…) fires. On by default; the card's own "mute"
 * toggle turns them off for the rest of the game (the events still fire and log).
 */
export function isEventNotices(): boolean {
  try {
    return localStorage.getItem(EVENT_NOTICES_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setEventNotices(v: boolean): boolean {
  try {
    localStorage.setItem(EVENT_NOTICES_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable — preference just won't persist */
  }
  return v;
}

/**
 * Reflect the current display preferences onto the document root so CSS can key
 * off them (`:root[data-colourblind="1"]`, `:root[data-reduce-motion="1"]`).
 * Safe to call any time; a no-op outside the browser.
 */
export function applyDisplaySettings(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.colourblind = isColourblind() ? "1" : "0";
  root.dataset.reduceMotion = isReduceMotion() ? "1" : "0";
}
