/**
 * End-turn advisor — the Civ-style "nothing idle, ever" checklist. A pure
 * derivation over GameState listing what still wants orders this turn:
 * research unchosen, owned regions building nothing (that still have
 * something available to build), and armies that haven't spent their moves.
 *
 * Pure and read-only (no DOM, no RNG): the HUD renders whatever it returns
 * and jumps to the offending place on click.
 */

import { BUILDINGS, BUILDING_IDS, type BuildingId } from "@/data/buildings";
import { isBuildingUnlockedFor, researchFrontier } from "@/systems/tech";
import { eraIndexForTurn } from "@/data/eras";
import { PLAYER_ID, playerNation, type GameState } from "@/systems/state";

export interface Advice {
  kind: "research" | "build" | "army";
  /** Chip label, e.g. "2 regions building nothing". */
  label: string;
  /** Regions to jump to (idle regions, or the idle armies' regions). */
  regionIds: number[];
}

/** What still wants orders before this turn ends (empty = all clear). */
export function deriveAdvice(state: GameState): Advice[] {
  const advice: Advice[] = [];
  const player = playerNation(state);

  // Research idle — and there is an age-appropriate tech to pick.
  if (!player.research.current && researchFrontier(player.research.done, eraIndexForTurn(state.turn)).length > 0) {
    advice.push({ kind: "research", label: "No research chosen", regionIds: [] });
  }

  // Regions with a free construction slot that still have something to build.
  const idle = state.regions.filter((r) => regionCanStartBuild(state, r.id));
  if (idle.length > 0) {
    advice.push({
      kind: "build",
      label: `${idle.length} region${idle.length === 1 ? "" : "s"} building nothing`,
      regionIds: idle.map((r) => r.id),
    });
  }

  // Armies with unspent moves.
  const restless = state.armies.filter((a) => a.ownerId === PLAYER_ID && a.movesLeft > 0);
  if (restless.length > 0) {
    advice.push({
      kind: "army",
      label: `${restless.length} arm${restless.length === 1 ? "y has" : "ies have"} moves left`,
      regionIds: restless.map((a) => a.regionId),
    });
  }

  return advice;
}

/** A free slot AND at least one buildable option (terrain ok, tech unlocked, not built). */
export function regionCanStartBuild(state: GameState, regionId: number): boolean {
  const region = state.regions[regionId];
  if (!region || region.ownerId !== PLAYER_ID || region.construction) return false;
  return buildOptions(state, regionId).length > 0;
}

/** The building ids a region could start right now (shared with the overview's quick-build). */
export function buildOptions(state: GameState, regionId: number): BuildingId[] {
  const region = state.regions[regionId];
  if (!region) return [];
  const done = playerNation(state).research.done;
  return BUILDING_IDS.filter((id) => {
    const def = BUILDINGS[id];
    if (def.requiresTerrain && def.requiresTerrain !== region.terrain) return false;
    if (region.buildings.includes(id)) return false;
    return isBuildingUnlockedFor(done, id);
  });
}
