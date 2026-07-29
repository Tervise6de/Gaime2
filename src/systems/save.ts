/**
 * Save / load — a simple JSON snapshot (docs/game-design.md §2, M6).
 *
 * `GameState` is already a plain, serialisable object, so saving is just
 * `JSON.stringify` wrapped with a version tag, and loading is a guarded parse.
 * Saves live in `localStorage`; the game autosaves each turn and can be
 * exported/imported as a JSON string for sharing or backup.
 */

import {
  MAX_ENTRENCH,
  armySize,
  emptyUnits,
  emptyWares,
  TURN_LIMIT,
  type Army,
  type GameState,
} from "@/systems/state";
import { SOUND } from "@/data/sound";
import { SEA_ZONE_IDS } from "@/data/sea";
import { UNITS, UNIT_TYPES } from "@/data/units";
import { COMMANDER_TRAIT_IDS } from "@/data/commanders";
import { AI_STRATEGIES } from "@/systems/strategy";

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
      const nationIds = new Set(s.nations.map((nation) => nation?.id));
      const regionIds = new Set(s.regions.map((region) => region?.id));
      const normalized: Army[] = [];
      const usedArmyIds = new Set<number>();
      let repairArmyId =
        s.armies.reduce(
          (max, army) => Math.max(max, Number.isFinite(Number(army?.id)) ? Math.floor(Number(army.id)) : -1),
          -1,
        ) + 1;
      for (const raw of s.armies) {
        if (
          !raw ||
          typeof raw !== "object" ||
          !Number.isFinite(Number(raw.id)) ||
          !nationIds.has(raw.ownerId) ||
          !regionIds.has(raw.regionId)
        ) {
          continue;
        }

        const units = emptyUnits();
        for (const type of UNIT_TYPES) {
          const value = Number(raw.units?.[type]);
          units[type] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        }
        if (armySize(units) <= 0) continue;

        const moveRate = UNIT_TYPES.reduce(
          (minimum, type) =>
            units[type] > 0 ? Math.min(minimum, UNITS[type].moves) : minimum,
          Number.POSITIVE_INFINITY,
        );
        const rawMoves = Number(raw.movesLeft);
        const movesLeft = Number.isFinite(rawMoves)
          ? Math.max(
              0,
              Math.min(
                moveRate === Number.POSITIVE_INFINITY ? 0 : moveRate,
                Math.floor(rawMoves),
              ),
            )
          : 0;
        const requestedId = Math.max(0, Math.floor(Number(raw.id)));
        const armyId = usedArmyIds.has(requestedId) ? repairArmyId++ : requestedId;
        usedArmyIds.add(armyId);
        const army: Army = {
          ...raw,
          id: armyId,
          units,
          movesLeft,
        };

        if (army.commander) {
          const martial = Number(army.commander.martial);
          const loyalty = Number(army.commander.loyalty);
          if (
            typeof army.commander.name !== "string" ||
            typeof army.commander.epithet !== "string" ||
            !COMMANDER_TRAIT_IDS.includes(army.commander.trait) ||
            !Number.isFinite(martial) ||
            !Number.isFinite(loyalty)
          ) {
            delete army.commander;
          } else {
            army.commander = {
              ...army.commander,
              name: army.commander.name.slice(0, 80),
              epithet: army.commander.epithet.slice(0, 80),
              martial: Math.max(0, Math.min(20, Math.floor(martial))),
              loyalty: Math.max(0, Math.min(100, Math.floor(loyalty))),
            };
          }
        }

        const wasFleet = UNIT_TYPES.some((type) => !!UNITS[type].naval && units[type] > 0);
        let isFleet = wasFleet;
        const hadSeaMarker = army.seaZoneId !== undefined;
        if (
          army.seaZoneId !== undefined &&
          (!SEA_ZONE_IDS.includes(army.seaZoneId) || !isFleet)
        ) {
          delete army.seaZoneId;
        }
        // `regionId` is the fleet's last physical port, not necessarily a port
        // touching its current zone after several zone-to-zone moves. A valid
        // sea-zone id plus a surviving ship is sufficient while it is at sea.

        // Repair impossible landed positions deterministically. A fleet needs a
        // friendly port; a ground army needs friendly ground.
        const anchor = s.regions[army.regionId];
        if (
          army.seaZoneId === undefined &&
          isFleet &&
          (anchor?.ownerId !== army.ownerId || anchor.terrain !== "coast")
        ) {
          const safePort = s.regions.find(
            (region) => region.ownerId === army.ownerId && region.terrain === "coast",
          );
          if (safePort) {
            army.regionId = safePort.id;
            army.dest = null;
          } else {
            // A landed fleet with no friendly port cannot exist. Preserve any
            // carried troops at friendly ground, but discard the impossible
            // hulls; a ships-only record has no legal recovery and is dropped.
            for (const type of UNIT_TYPES) {
              if (UNITS[type].naval) army.units[type] = 0;
            }
            isFleet = false;
            const safeLand = s.regions.find((region) => region.ownerId === army.ownerId);
            if (!safeLand || armySize(army.units) <= 0) continue;
            army.regionId = safeLand.id;
            army.dest = null;
          }
        } else if (
          army.seaZoneId === undefined &&
          !isFleet &&
          anchor?.ownerId !== army.ownerId
        ) {
          const safeLand = s.regions.find((region) => region.ownerId === army.ownerId);
          if (!safeLand) continue;
          army.regionId = safeLand.id;
          army.dest = null;
        }

        if (army.entrenchment !== undefined) {
          const rawEntrenchment = Number(army.entrenchment);
          army.entrenchment = Number.isFinite(rawEntrenchment)
            ? Math.max(0, Math.min(MAX_ENTRENCH, Math.floor(rawEntrenchment)))
            : 0;
        }
        if (wasFleet || army.seaZoneId !== undefined || hadSeaMarker) {
          if (army.fortifying) army.fortifying = false;
          if ((army.entrenchment ?? 0) > 0) army.entrenchment = 0;
        } else if (army.fortifying !== undefined) {
          army.fortifying = army.fortifying === true;
        }

        if (
          army.dest !== undefined &&
          army.dest !== null &&
          (
            !regionIds.has(army.dest) ||
            army.seaZoneId !== undefined ||
            (isFleet && s.regions[army.dest]?.terrain !== "coast")
          )
        ) {
          army.dest = null;
        }
        normalized.push(army);
      }

      // One owner has one landed stack per region. Merge malformed duplicates
      // so armyAt/combat cannot silently select an arbitrary stack.
      const merged: Army[] = [];
      for (const army of normalized) {
        const existing = army.seaZoneId === undefined
          ? merged.find(
              (candidate) =>
                candidate.seaZoneId === undefined &&
                candidate.ownerId === army.ownerId &&
                candidate.regionId === army.regionId,
            )
          : undefined;
        if (!existing) {
          merged.push(army);
          continue;
        }
        for (const type of UNIT_TYPES) existing.units[type] += army.units[type];
        existing.movesLeft = Math.min(existing.movesLeft, army.movesLeft);
        existing.commander ??= army.commander;
        existing.dest = null;
        existing.fortifying = false;
        existing.entrenchment = 0;
      }
      s.armies = merged;
      const maxArmyId = merged.reduce((max, army) => Math.max(max, army.id), -1);
      s.nextArmyId = Math.max(
        Number.isFinite(Number(s.nextArmyId)) ? Math.floor(Number(s.nextArmyId)) : 0,
        maxArmyId + 1,
      );
    }
    // The wares economy replaced the abstract "materials" resource: a pre-wares
    // save has nations with no `wares` (and a now-dead stocks.materials). Back-fill
    // an empty ware stockpile so every nation.wares access is safe. Any present
    // wares record is completed to the full ware set so a save from before a ware
    // existed doesn't read that slot as undefined (→ NaN) in ware arithmetic.
    for (const n of s.nations) {
      if (!n) continue;
      n.wares = { ...emptyWares(), ...(n.wares ?? {}) };
      // A rival's strategy is a small enum the AI branches on; a save carrying
      // anything else (hand-edited, or from before strategies existed) must not
      // hand `strategyProfile` an unknown key. A rival without one re-rolls to
      // the neutral plan and is re-read on its next turn like any other.
      if (n.strategy !== undefined && !AI_STRATEGIES.includes(n.strategy)) delete n.strategy;
      const since = Number(n.strategySince);
      if (n.strategySince !== undefined) {
        n.strategySince = Number.isFinite(since) ? Math.max(0, Math.floor(since)) : 0;
      }
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
