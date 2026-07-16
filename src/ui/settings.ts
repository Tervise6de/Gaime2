/**
 * Persisted display/accessibility preferences that aren't audio (those live in
 * `ui/audio.ts`). Kept tiny and framework-free: each preference is a localStorage
 * key with a typed getter/setter. `applyDisplaySettings()` reflects the toggles
 * onto the document root as data-attributes so CSS (and later B4/B5 features) can
 * react. UI-only — never touches the sim.
 */

const COLOURBLIND_KEY = "gaime2:colourblind";
const REDUCE_MOTION_KEY = "gaime2:reduceMotion";

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
