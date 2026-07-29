/**
 * Player-facing copy that carries a rule.
 *
 * Most of the HUD's text is decoration and can live where it is drawn. Some of
 * it is not: when a sentence is the *only* place the game explains a rule, that
 * sentence is part of the rule, and it belongs somewhere it can be asserted.
 *
 * This module exists because it once was not. v0.115 made open water impassable
 * to armies and shipped with no word of it anywhere in `src/ui/` — the rule was
 * real, the map still drew the two provinces touching, and a march simply
 * failed. Every sim rule had tests; the sentence that would have told the player
 * had nowhere to be tested, so there was no sentence.
 *
 * So: pure functions, `GameState` in and a string out, tested against the same
 * data the rule reads. The DOM builders in `hud.ts` and the intent handlers in
 * `main.ts` call these rather than composing text inline. Following the pattern
 * `ui/advisor.ts`, `ui/military.ts` and `ui/alerts.ts` already set.
 *
 * No DOM, no side effects, no markup — callers escape and wrap.
 */

import { SEA_ZONES } from "@/data/sea";
import { armyIsFleet, armyIsAtSea } from "@/systems/military";
import { isSeaCrossing, landNeighbours, type Army, type GameState } from "@/systems/state";

/** A line of copy with the hover text that explains it. */
export interface Note {
  text: string;
  title: string;
}

/**
 * What the region panel says about the water around a province.
 *
 * Three cases, and the middle one is the whole reason this exists: a province
 * with land roads *and* water borders looks no different on the map from one
 * with land roads only. Null when a province touches no water at all.
 */
export function waterNote(state: GameState, regionId: number): (Note & { island: boolean }) | null {
  const region = state.regions[regionId];
  if (!region) return null;
  const wet = (region.seaLinks ?? []).filter((id) => state.regions[id]);
  if (wet.length === 0) return null;
  const names = wet.map((id) => state.regions[id]!.name).join(", ");
  const island = landNeighbours(state, regionId).length === 0;
  return {
    island,
    text: island
      ? `An island. No land road anywhere — ${names} lie across open water. Soldiers reach it only by sea: put them in a stack with warships, sail, and land.`
      : `Across water: ${names}. Trade crosses freely; armies need a hull.`,
    title:
      "Open-water borders. A trade lane is carried by ship and crosses them; an army has to embark — sail a stack holding warships and soldiers into the sea beyond, then land on the far shore.",
  };
}

/**
 * Why a move order was refused, in the player's terms.
 *
 * A generic "no route" reads as a bug when the two provinces are plainly
 * touching on the map, so every refusal names its cause and what would answer
 * it. Ordered from the most specific cause to the least.
 */
export function noRouteReason(state: GameState, army: Army, destId: number): string {
  const dest = state.regions[destId];
  if (!dest) return "No route there — the army can't reach that region.";
  if (armyIsFleet(army.units) && dest.terrain !== "coast") {
    return `${dest.name} is inland — a fleet can only put in at a port.`;
  }
  if (armyIsAtSea(army)) {
    const zone = army.seaZoneId === undefined ? null : SEA_ZONES[army.seaZoneId];
    return zone && !zone.coastalRegions.includes(destId)
      ? `${dest.name} is not on ${zone.name} — sail to the sea that touches it first.`
      : `No landing at ${dest.name} is open to this fleet.`;
  }
  if (isSeaCrossing(state, army.regionId, destId)) {
    return `${dest.name} lies across open water — soldiers need a hull. Put them in a stack with warships, sail to the sea beyond, then land.`;
  }
  if (!landReachable(state, army.regionId, destId)) {
    return `No land road to ${dest.name} — it can only be reached by sea. Sail a stack carrying warships and soldiers, then land from the water.`;
  }
  return `No route to ${dest.name} — the army can't reach it this way.`;
}

/**
 * What a land stack standing on a shore needs before it can cross. Null when
 * the question does not arise: a fleet, a stack at sea, or dry land all round.
 *
 * `canRaiseShipHere` is passed in rather than recomputed so this stays free of
 * the muster rules; the caller already knows.
 */
export function embarkNote(
  state: GameState,
  army: Army,
  canRaiseShipHere: boolean,
): Note | null {
  if (armyIsAtSea(army) || armyIsFleet(army.units)) return null;
  if ((state.regions[army.regionId]?.seaLinks?.length ?? 0) === 0) return null;
  return {
    text:
      "These soldiers cannot cross open water. " +
      (canRaiseShipHere
        ? "Raise a War-Cog here and it joins this stack — then sail, and land on the far shore."
        : "Bring them to a port with warships (the two merge into one stack), then sail and land."),
    title:
      "A stack that holds at least one warship can sail. Landing on a rival's shore is an assault: the soldiers storm it while the hulls stand offshore.",
  };
}

/** Whether a march could ever get from one region to another over land. */
export function landReachable(state: GameState, fromId: number, toId: number): boolean {
  if (fromId === toId) return true;
  const seen = new Set([fromId]);
  const queue = [fromId];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === toId) return true;
    for (const nb of landNeighbours(state, n)) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return false;
}
