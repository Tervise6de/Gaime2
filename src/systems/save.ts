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
 * Save slots: `auto` is written continuously for refresh/crash recovery (the
 * game resumes from it on load); `slot1..slot3` are named checkpoints the player
 * writes with the Save button and restores with Load. `slot1` keeps the original
 * single-checkpoint key so pre-existing saves still load.
 */
export type SaveSlot = "auto" | "slot1" | "slot2" | "slot3";
/** The player-writable checkpoint slots, in display order. */
export const MANUAL_SLOTS: readonly SaveSlot[] = ["slot1", "slot2", "slot3"];
const STORAGE_KEY: Record<SaveSlot, string> = {
  auto: "gaime2.save.auto.v1",
  slot1: "gaime2.save.manual.v1", // legacy key — keeps older checkpoints loadable
  slot2: "gaime2.save.slot2.v1",
  slot3: "gaime2.save.slot3.v1",
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
    // Defence in depth: fields that flow into UI templates or arithmetic are
    // JSON-typed only, so a hand-edited/shared save could smuggle a non-number
    // seed or an unknown difficulty. Coerce/whitelist them here so a bad save
    // degrades gracefully instead of poisoning the HUD or the RNG. (String
    // names are additionally escaped at every render sink.)
    s.seed = Number(s.seed) >>> 0;
    if (s.difficulty !== "easy" && s.difficulty !== "normal" && s.difficulty !== "hard") {
      s.difficulty = "normal";
    }
    return s;
  } catch {
    return null;
  }
}

/** Write a save to a localStorage slot. Returns false if storage is unavailable. */
export function saveToLocal(state: GameState, savedAt: number, slot: SaveSlot = "slot1"): boolean {
  try {
    localStorage.setItem(STORAGE_KEY[slot], serializeGame(state, savedAt));
    return true;
  } catch {
    return false;
  }
}

/** Read a save from a slot, or null. */
export function loadFromLocal(slot: SaveSlot = "slot1"): GameState | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY[slot]);
    return json ? deserializeGame(json) : null;
  } catch {
    return null;
  }
}

/** Whether a save exists in a slot. */
export function hasLocalSave(slot: SaveSlot = "slot1"): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY[slot]) !== null;
  } catch {
    return false;
  }
}

/** Remove a slot's checkpoint. Returns true only if something was cleared. */
export function clearLocalSave(slot: SaveSlot): boolean {
  try {
    const key = STORAGE_KEY[slot];
    if (localStorage.getItem(key) === null) return false;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** A slot's saved turn + timestamp for labelling the picker, or null if empty. */
export function slotInfo(slot: SaveSlot): { turn: number; savedAt: number } | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY[slot]);
    if (!json) return null;
    const parsed = JSON.parse(json) as SaveEnvelope;
    if (!parsed || parsed.version !== SAVE_VERSION || typeof parsed.state?.turn !== "number") {
      return null;
    }
    return { turn: parsed.state.turn, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}
