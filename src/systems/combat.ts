/**
 * Abstract combat resolution.
 *
 * The numbers are tuned so a lone army usually cannot crack a fortified,
 * garrisoned, or mountainous defender: population, fortification and terrain
 * stack the defence high. Beating such a target means bringing more force —
 * merging stacks or adding siege. That asymmetry is the whole point of the
 * "concentration of force" AI (systems/ai.ts).
 *
 * `attackStrength`/`defenseStrength` are RNG-free estimators the AI uses to plan.
 * `resolveAttack` consumes the RNG for the actual dice and mutates the (cloned)
 * state through the caller.
 */

import { COUNTER_BONUS, FORT_STRENGTH, TERRAIN, UNITS, emptyUnits, totalUnits } from "@/systems/data";
import type { Rng } from "@/systems/rng";
import type { Army, GameState, Units } from "@/systems/types";
import { UNIT_TYPES } from "@/systems/types";

/** Defence contributed per point of a region's population (militia levy). */
export const POP_DEFENSE = 2;

export interface AttackOutcome {
  attackerWins: boolean;
  captured: boolean;
  attackerPower: number;
  defenderPower: number;
  attackerLossFraction: number;
  log: string;
}

/** Raw offensive strength of a stack attacking into a terrain (RNG-free). */
export function attackStrength(units: Units, terrain: keyof typeof TERRAIN): number {
  let power = 0;
  for (const type of UNIT_TYPES) power += units[type] * UNITS[type].attack;
  return power * TERRAIN[terrain].attackMod;
}

/** Fortification the attacker's siege units can neutralise. */
export function siegePotential(units: Units): number {
  return units.siege * UNITS.siege.siegeBonus;
}

/** Total defensive strength of a region: garrison + population + fort + terrain. */
export function defenseStrength(state: GameState, regionId: number): number {
  const region = state.regions[regionId];
  let garrison = 0;
  for (const army of state.armies) {
    if (army.location === regionId && army.owner === region.owner) {
      for (const type of UNIT_TYPES) garrison += army.units[type] * UNITS[type].defense;
    }
  }
  const popDef = region.owner >= 0 ? region.population * POP_DEFENSE : region.population * (POP_DEFENSE * 0.4);
  const field = (garrison + popDef) * TERRAIN[region.terrain].defenseMod;
  return field + region.fort * FORT_STRENGTH;
}

/**
 * Effective attack strength an attacker brings against a specific region,
 * accounting for siege eating fortification. RNG-free — used both by the AI to
 * decide whether it can win and by resolveAttack for the deterministic base.
 */
export function effectiveAttack(state: GameState, units: Units, regionId: number): number {
  const region = state.regions[regionId];
  const raw = attackStrength(units, region.terrain);
  const fortValue = region.fort * FORT_STRENGTH;
  const siegeRelief = Math.min(fortValue, siegePotential(units));
  // Countering the garrison's dominant unit type grants a bonus.
  const bonus = counterBonus(state, units, regionId);
  return raw * bonus + siegeRelief;
}

function counterBonus(state: GameState, units: Units, regionId: number): number {
  const region = state.regions[regionId];
  const enemy = emptyUnits();
  for (const army of state.armies) {
    if (army.location === regionId && army.owner === region.owner) {
      for (const type of UNIT_TYPES) enemy[type] += army.units[type];
    }
  }
  const enemyTotal = totalUnits(enemy);
  if (enemyTotal === 0) return 1;
  // Dominant enemy unit type.
  let dominant: keyof Units = "infantry";
  let best = -1;
  for (const type of UNIT_TYPES) {
    if (enemy[type] > best) {
      best = enemy[type];
      dominant = type;
    }
  }
  const counterCount = UNIT_TYPES.filter((t) => UNITS[t].counters === dominant).reduce(
    (n, t) => n + units[t],
    0,
  );
  const frac = counterCount / Math.max(1, totalUnits(units));
  return 1 + frac * (COUNTER_BONUS - 1);
}

/** Resolve an attack from `army` into `targetId`, mutating the cloned state. */
export function resolveAttack(
  state: GameState,
  rng: Rng,
  army: Army,
  targetId: number,
): AttackOutcome {
  const region = state.regions[targetId];
  const attackerPower = effectiveAttack(state, army.units, targetId) * rng.range(0.85, 1.15);
  const defenderPower = defenseStrength(state, targetId) * rng.range(0.85, 1.15);
  const attackerWins = attackerPower > defenderPower;

  const ratio = defenderPower / (attackerPower + defenderPower || 1);
  let attackerLossFraction: number;
  let log: string;

  if (attackerWins) {
    attackerLossFraction = clamp01(ratio * 0.7);
    // Defender garrison is destroyed; population is bloodied; fort is slighted.
    destroyGarrison(state, targetId);
    region.population = Math.max(1, Math.round(region.population * 0.6));
    region.fort = Math.max(0, region.fort - 1);
    applyCasualties(army.units, attackerLossFraction);
    const prevOwner = region.owner;
    region.owner = army.owner;
    army.location = targetId;
    checkEliminated(state, prevOwner);
    log = `${nationName(state, army.owner)} vallutas ${region.name}`;
  } else {
    attackerLossFraction = clamp01((1 - ratio) * 0.85 + 0.1);
    applyCasualties(army.units, attackerLossFraction);
    // Defender takes lighter losses from the repelled assault.
    bloodyGarrison(state, targetId, rng, 0.25);
    log = `${nationName(state, army.owner)} tõrjuti tagasi ${region.name} juures`;
  }

  return {
    attackerWins,
    captured: attackerWins,
    attackerPower,
    defenderPower,
    attackerLossFraction,
    log,
  };
}

function destroyGarrison(state: GameState, regionId: number): void {
  const region = state.regions[regionId];
  state.armies = state.armies.filter(
    (a) => !(a.location === regionId && a.owner === region.owner),
  );
}

function bloodyGarrison(state: GameState, regionId: number, rng: Rng, frac: number): void {
  const region = state.regions[regionId];
  for (const army of state.armies) {
    if (army.location === regionId && army.owner === region.owner) {
      applyCasualties(army.units, frac * rng.range(0.7, 1.3));
    }
  }
  state.armies = state.armies.filter((a) => totalUnits(a.units) > 0);
}

/** Remove `fraction` of every unit type (probabilistic rounding kept simple). */
export function applyCasualties(units: Units, fraction: number): void {
  for (const type of UNIT_TYPES) {
    const lost = Math.round(units[type] * fraction);
    units[type] = Math.max(0, units[type] - lost);
  }
}

function checkEliminated(state: GameState, nationId: number): void {
  if (nationId < 0) return;
  const stillOwns = state.regions.some((r) => r.owner === nationId);
  if (!stillOwns) {
    const nation = state.nations[nationId];
    if (nation && nation.alive) {
      nation.alive = false;
      state.armies = state.armies.filter((a) => a.owner !== nationId);
      state.log.push(`${nation.name} on hävitatud`);
    }
  }
}

function nationName(state: GameState, nationId: number): string {
  return state.nations[nationId]?.name ?? "Neutraalne";
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
