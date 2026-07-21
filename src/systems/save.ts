/**
 * Save / load — a simple JSON snapshot (docs/game-design.md §2, M6).
 *
 * `GameState` is already a plain, serialisable object, so saving is just
 * `JSON.stringify` wrapped with a version tag, and loading is a guarded parse.
 * Saves live in `localStorage`; the game autosaves each turn and can be
 * exported/imported as a JSON string for sharing or backup.
 */

import { emptyUnits, emptyWares, TURN_LIMIT, type GameState } from "@/systems/state";
import { SOUND } from "@/data/sound";

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
  // `battles` is a transient, per-turn UI cache (combat reports the player has
  // already seen) — never persist it, so a reloaded save starts battle-clean.
  const { battles: _battles, ...persisted } = state;
  const envelope: SaveEnvelope = { version: SAVE_VERSION, savedAt, state: persisted };
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
    // Game-length setting arrived after some saves: a missing turnLimit means a
    // pre-setting save, which was always the standard length — back-fill it so
    // old saves load and resolve exactly as before. (An explicit null = endless.)
    if (s.turnLimit === undefined) s.turnLimit = TURN_LIMIT;
    // The merchant layer (trade routes + Kontore) arrived after some saves: a
    // pre-trade save has no routes/Kontore, which loads as "no trade yet" — the
    // route sim (stepTrade) is a no-op on empty routes, so it resolves exactly as
    // before. Back-fill so the optional fields are always present.
    if (s.routes === undefined) s.routes = [];
    if (s.nextRouteId === undefined) s.nextRouteId = 0;
    if (s.kontore === undefined) s.kontore = [];
    // The Øresund Sound toll arrived after the merchant layer: back-fill a Hansa
    // save that predates it (default rate, no embargoes), and coerce the fields of
    // any present Sound so a hand-edited save can't smuggle a bad rate/list.
    if (s.sound === undefined && s.mapId === "hansa") {
      s.sound = { regionId: SOUND.regionId, tollRate: SOUND.defaultRate, embargoes: [] };
    } else if (s.sound) {
      const rate = Number(s.sound.tollRate);
      s.sound.tollRate = Number.isFinite(rate) ? Math.max(0, Math.min(SOUND.maxRate, rate)) : SOUND.defaultRate;
      s.sound.embargoes = Array.isArray(s.sound.embargoes) ? s.sound.embargoes.filter((n) => typeof n === "number") : [];
    }
    // The Hanseatic League is optional (founded mid-game); coerce its lists if present.
    if (s.league) {
      s.league.members = Array.isArray(s.league.members) ? s.league.members.filter((n) => typeof n === "number") : [];
      s.league.boycotts = Array.isArray(s.league.boycotts) ? s.league.boycotts.filter((n) => typeof n === "number") : [];
      if (s.league.members.length === 0) s.league = undefined; // an empty League is no League
    }
    // Forward-migrate army unit records: a save from before a unit type existed
    // lacks that key, which would read as `undefined` (→ NaN) in armySize/combat.
    // Backfill every unit slot to 0 so older saves load cleanly.
    if (Array.isArray(s.armies)) {
      for (const a of s.armies) {
        if (a && a.units) a.units = { ...emptyUnits(), ...a.units };
      }
    }
    // The wares economy replaced the abstract "materials" resource: a pre-wares
    // save has nations with no `wares` (and a now-dead stocks.materials). Back-fill
    // an empty ware stockpile so every nation.wares access is safe. Any present
    // wares record is completed to the full ware set so a save from before a ware
    // existed doesn't read that slot as undefined (→ NaN) in ware arithmetic.
    for (const n of s.nations) {
      if (n) n.wares = { ...emptyWares(), ...(n.wares ?? {}) };
    }
    // Renown (R6) needs no back-fill: nationScore and the HUD read it as `?? 0`, and
    // the turn pipeline stamps it on each living realm — so a pre-R6 save simply
    // starts renown at zero on its next turn (and stays round-trip-identical here).
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
