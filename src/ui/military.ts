/**
 * Pure presentation helpers for armies and fleets. The simulation stores one
 * regiment or one hull as one unit, but only land regiments use the ×250 soldier
 * display scale. Keeping the distinction here prevents a single ship from being
 * presented as "250 warships" across the HUD and map.
 */

import { UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import type { BattleReport, UnitCounts } from "@/systems/combat";
import { reachableRegions } from "@/systems/military";
import { soldiersCompact, soldiersDisplay } from "@/systems/format";
import { PLAYER_ID, armySize, type Army, type GameState } from "@/systems/state";

/** Number of land regiments represented by a force record. */
export function landUnitCount(units: UnitCounts): number {
  return UNIT_TYPES.reduce(
    (sum, type) => sum + (UNITS[type].naval ? 0 : Math.max(0, units[type] ?? 0)),
    0,
  );
}

/** Number of warship hulls represented by a force record. */
export function shipCount(units: UnitCounts): number {
  return UNIT_TYPES.reduce(
    (sum, type) => sum + (UNITS[type].naval ? Math.max(0, units[type] ?? 0) : 0),
    0,
  );
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Human-readable total for a land army, fleet, or mixed expeditionary force. */
export function forceLabel(units: UnitCounts): string {
  const land = landUnitCount(units);
  const ships = shipCount(units);
  const parts: string[] = [];
  if (land > 0) parts.push(`${soldiersDisplay(land)} soldiers`);
  if (ships > 0) parts.push(plural(ships, "warship"));
  return parts.join(" · ") || "No forces";
}

/** Compact map/badge form, preserving raw ship counts. */
export function forceCompactLabel(units: UnitCounts): string {
  const land = landUnitCount(units);
  const ships = shipCount(units);
  if (land > 0 && ships > 0) return `${soldiersCompact(land)} + ${ships}⚓`;
  if (ships > 0) return `${ships}⚓`;
  return soldiersCompact(land);
}

/** Display one unit type in a composition or casualty breakdown. */
export function unitDisplay(type: UnitType, count: number, compact = false): string {
  if (UNITS[type].naval) return String(Math.max(0, Math.floor(count)));
  return compact ? soldiersCompact(count) : soldiersDisplay(count);
}

/** The player's ready forces that can legally enter the target right now. */
export function eligiblePlayerAttackers(state: GameState, targetRegionId: number): Army[] {
  return state.armies
    .filter(
      (army) =>
        army.ownerId === PLAYER_ID &&
        army.movesLeft > 0 &&
        armySize(army.units) > 0 &&
        reachableRegions(state, army).includes(targetRegionId),
    )
    .sort((a, b) => armySize(b.units) - armySize(a.units) || a.id - b.id);
}

/** One-line battle verdict from the player's seat, with naval vocabulary at sea. */
export function battleVerdict(report: BattleReport, youAttacked: boolean): string {
  if (report.battleKind === "naval") {
    if (youAttacked) {
      return report.outcome === "captured"
        ? "Victory — sea lane won"
        : report.outcome === "repelled"
          ? "Defeat — fleet destroyed"
          : "Disengaged — attack broken off";
    }
    return report.outcome === "captured"
      ? "Defeat — sea lane lost"
      : report.outcome === "repelled"
        ? "Victory — attackers sunk"
        : "Held — fleet stood firm";
  }
  if (youAttacked) {
    return report.outcome === "captured"
      ? "Victory — region taken"
      : report.outcome === "repelled"
        ? "Defeat — army destroyed"
        : "Repulsed — the assault stalled";
  }
  return report.outcome === "captured"
    ? "Defeat — region lost"
    : report.outcome === "repelled"
      ? "Victory — attackers destroyed"
      : "Held — the line stood";
}
