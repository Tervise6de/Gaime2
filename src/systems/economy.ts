/**
 * Economy: per-region output, national income, army upkeep, population growth.
 *
 * The foundation uses a single accumulating resource — the gold treasury — with
 * materials priced into unit costs. That is enough scarcity to make army size a
 * real trade-off (you cannot afford an unlimited stack), which is what gives
 * concentration of force its teeth. Pure: these functions read state and the
 * pipeline (systems/turn.ts) applies the mutations on a cloned state.
 */

import { TERRAIN } from "@/systems/data";
import { UNITS } from "@/systems/data";
import type { GameState, Region } from "@/systems/types";

/** Gross gold a region yields for its owner at a given tax rate. */
export function regionGold(region: Region, taxRate: number): number {
  if (region.owner < 0) return 0;
  const base = TERRAIN[region.terrain].gold * region.population;
  return base * (0.6 + taxRate);
}

/** Total per-turn gold upkeep of a nation's armies. */
export function nationUpkeep(state: GameState, nationId: number): number {
  let upkeep = 0;
  for (const army of state.armies) {
    if (army.owner !== nationId) continue;
    for (const type of Object.keys(army.units) as Array<keyof typeof army.units>) {
      upkeep += army.units[type] * UNITS[type].upkeep;
    }
  }
  return upkeep;
}

/** Net gold change for a nation this turn (income minus upkeep). */
export function nationNetIncome(state: GameState, nationId: number): number {
  const nation = state.nations[nationId];
  if (!nation) return 0;
  let gross = 0;
  for (const region of state.regions) {
    if (region.owner === nationId) gross += regionGold(region, nation.taxRate);
  }
  return gross - nationUpkeep(state, nationId);
}

/**
 * Advance the economy one turn (mutates the given — already cloned — state):
 * credit net income and grow/shrink population toward terrain capacity, damped
 * by high taxation.
 */
export function applyEconomy(state: GameState): void {
  for (const nation of state.nations) {
    if (!nation.alive) continue;
    nation.treasury = Math.round((nation.treasury + nationNetIncome(state, nation.id)) * 100) / 100;
  }
  for (const region of state.regions) {
    if (region.owner < 0) continue;
    const nation = state.nations[region.owner];
    const cap = TERRAIN[region.terrain].capacity;
    const taxDrag = nation ? Math.max(0, nation.taxRate - 0.2) : 0;
    if (region.population < cap) {
      region.population = Math.min(cap, region.population + 0.35 - taxDrag);
    } else if (region.population > cap) {
      region.population = Math.max(cap, region.population - 0.2);
    }
  }
}
