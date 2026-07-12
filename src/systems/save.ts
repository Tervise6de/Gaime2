/**
 * Save / load — a simple JSON snapshot (docs/game-design.md §2, M6).
 *
 * `GameState` is already a plain, serialisable object, so saving is just
 * `JSON.stringify` wrapped with a version tag, and loading is a guarded parse.
 * Saves live in `localStorage`; the game autosaves each turn and can be
 * exported/imported as a JSON string for sharing or backup.
 */

import type { GameState } from "@/systems/state";

const SAVE_VERSION = 1;
/**
 * Two slots: `auto` is written continuously for refresh/crash recovery (the
 * game resumes from it on load); `manual` is a checkpoint the player writes with
 * the Save button and restores with Load.
 */
export type SaveSlot = "auto" | "manual";
const STORAGE_KEY: Record<SaveSlot, string> = {
  auto: "gaime2.save.auto.v1",
  manual: "gaime2.save.manual.v1",
};

interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
}

/** Serialise a game to a JSON string. */
export function serializeGame(state: GameState, savedAt: number): string {
  const envelope: SaveEnvelope = { version: SAVE_VERSION, savedAt, state };
  return JSON.stringify(envelope);
}

/** Parse a JSON string back into a GameState, or null if invalid/incompatible. */
export function deserializeGame(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json) as SaveEnvelope;
    if (!parsed || parsed.version !== SAVE_VERSION || !parsed.state) return null;
    // Minimal shape check — enough to reject unrelated JSON.
    const s = parsed.state;
    if (!Array.isArray(s.nations) || !Array.isArray(s.regions) || typeof s.turn !== "number") {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Write a save to a localStorage slot. Returns false if storage is unavailable. */
export function saveToLocal(state: GameState, savedAt: number, slot: SaveSlot = "manual"): boolean {
  try {
    localStorage.setItem(STORAGE_KEY[slot], serializeGame(state, savedAt));
    return true;
  } catch {
    return false;
  }
}

/** Read a save from a slot, or null. */
export function loadFromLocal(slot: SaveSlot = "manual"): GameState | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY[slot]);
    return json ? deserializeGame(json) : null;
  } catch {
    return null;
  }
}

/** Whether a save exists in a slot. */
export function hasLocalSave(slot: SaveSlot = "manual"): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY[slot]) !== null;
  } catch {
    return false;
  }
}
