/**
 * Combat — abstract battle resolution (docs/game-design.md §3.4).
 *
 * No tactical grid: two stacks meet and a single function decides the outcome
 * from their composition, the terrain, and fortification, with a bounded random
 * swing. Composition matters through the counter loop (a unit hits harder
 * against the type it counters), and *where* you fight matters through terrain
 * defence and forts (which siege units strip).
 *
 *   side_strength = Σ count · stat · (1 + COUNTER_BONUS · fraction_of_enemy_countered)
 *   defender_strength ·= terrain_defense · (1 + effective_fort · FORT_PER_LEVEL)
 *   ratio = atk / (atk + def)  ± random swing → winner; loser takes the heavier
 *   casualties, scaled by how lopsided the fight was. A wiped defender means the
 *   region is captured.
 *
 * Pure: all randomness comes from the passed-in Rng, so same inputs → same
 * outcome (deterministic and unit-testable).
 */

import { COUNTER_BONUS, UNITS, UNIT_TYPES, type UnitType } from "@/data/units";
import type { Rng } from "@/systems/rng";
import {
  CASUALTY_SCALE,
  COMBAT_VARIANCE,
  FORT_PER_LEVEL,
  armySize,
} from "@/systems/state";

export type UnitCounts = Record<UnitType, number>;

/** Attack or defence strength of a stack against a given opposing stack. */
export function sideStrength(
  own: UnitCounts,
  opponent: UnitCounts,
  stat: "attack" | "defense",
): number {
  const oppTotal = armySize(opponent) || 1;
  let total = 0;
  for (const t of UNIT_TYPES) {
    const count = own[t];
    if (!count) continue;
    const def = UNITS[t];
    let mod = 1;
    if (def.counters) mod += COUNTER_BONUS * (opponent[def.counters] / oppTotal);
    total += count * def[stat] * mod;
  }
  return total;
}

/** Total fortification levels a stack can strip when attacking. */
export function siegePower(units: UnitCounts): number {
  let s = 0;
  for (const t of UNIT_TYPES) s += units[t] * UNITS[t].siegePower;
  return s;
}

export interface CombatStrengths {
  attack: number;
  defense: number;
}

/**
 * The effective attack and defence strengths for a proposed fight, applying the
 * counter loop, terrain defence, and fortification (net of the attacker's siege
 * power). Shared by `resolveCombat` and the UI odds preview so both agree.
 */
export function combatStrengths(
  attacker: UnitCounts,
  defender: UnitCounts,
  ctx: CombatContext,
): CombatStrengths {
  const effFort = Math.max(0, ctx.fortification - siegePower(attacker));
  const attack = sideStrength(attacker, defender, "attack");
  const defense =
    sideStrength(defender, attacker, "defense") *
    ctx.terrainDefense *
    (1 + effFort * FORT_PER_LEVEL);
  return { attack, defense };
}

/**
 * Probability the attacker wins, from the strength ratio and the bounded uniform
 * combat swing (±COMBAT_VARIANCE). Matches `resolveCombat`'s win condition
 * (effRatio ≥ 0.5), so the preview reflects the real dice.
 */
export function winChance(attack: number, defense: number): number {
  const ratio = attack / (attack + defense || 1);
  const v = COMBAT_VARIANCE;
  if (v <= 0) return ratio >= 0.5 ? 1 : 0;
  return clamp((ratio - 0.5 + v) / (2 * v), 0, 1);
}

export interface CombatPreview extends CombatStrengths {
  /** Attacker win probability in [0,1]. */
  winChance: number;
  /** True when the target has no defenders (an uncontested capture). */
  undefended: boolean;
}

/** Non-destructive combat forecast for the UI: strengths + win chance. Pure. */
export function previewCombat(
  attacker: UnitCounts,
  defender: UnitCounts,
  ctx: CombatContext,
): CombatPreview {
  if (armySize(defender) === 0) {
    return {
      attack: sideStrength(attacker, defender, "attack"),
      defense: 0,
      winChance: 1,
      undefended: true,
    };
  }
  const { attack, defense } = combatStrengths(attacker, defender, ctx);
  return { attack, defense, winChance: winChance(attack, defense), undefended: false };
}

export interface CombatResult {
  attackerLosses: UnitCounts;
  defenderLosses: UnitCounts;
  attackerRemaining: UnitCounts;
  defenderRemaining: UnitCounts;
  attackerWins: boolean;
  /** Defender wiped out → region can be captured. */
  captured: boolean;
}

export interface CombatContext {
  terrainDefense: number;
  fortification: number;
}

export function resolveCombat(
  attacker: UnitCounts,
  defender: UnitCounts,
  ctx: CombatContext,
  rng: Rng,
): CombatResult {
  // Undefended region: walk in.
  if (armySize(defender) === 0) {
    return {
      attackerLosses: zero(),
      defenderLosses: zero(),
      attackerRemaining: { ...attacker },
      defenderRemaining: zero(),
      attackerWins: true,
      captured: true,
    };
  }

  const { attack: atk, defense: def } = combatStrengths(attacker, defender, ctx);

  const ratio = atk / (atk + def || 1);
  const swing = (rng.next() * 2 - 1) * COMBAT_VARIANCE;
  const effRatio = clamp(ratio + swing, 0, 1);
  const attackerWins = effRatio >= 0.5;

  // Lopsidedness in [0,1]: 0 at a coin-flip, 1 at total dominance.
  const edge = Math.abs(effRatio - 0.5) * 2;
  const loserFrac = clamp(CASUALTY_SCALE + 0.4 * edge, 0, 1);
  const winnerFrac = clamp(CASUALTY_SCALE * (1 - edge) * 0.6, 0, 1);

  const attackerFrac = attackerWins ? winnerFrac : loserFrac;
  const defenderFrac = attackerWins ? loserFrac : winnerFrac;

  const attackerLosses = scaleLosses(attacker, attackerFrac);
  const defenderLosses = scaleLosses(defender, defenderFrac);
  const attackerRemaining = subtract(attacker, attackerLosses);
  const defenderRemaining = subtract(defender, defenderLosses);

  return {
    attackerLosses,
    defenderLosses,
    attackerRemaining,
    defenderRemaining,
    attackerWins,
    captured: attackerWins && armySize(defenderRemaining) === 0,
  };
}

function scaleLosses(units: UnitCounts, frac: number): UnitCounts {
  const out = zero();
  for (const t of UNIT_TYPES) out[t] = Math.min(units[t], Math.round(units[t] * frac));
  return out;
}

function subtract(a: UnitCounts, b: UnitCounts): UnitCounts {
  const out = zero();
  for (const t of UNIT_TYPES) out[t] = Math.max(0, a[t] - b[t]);
  return out;
}

function zero(): UnitCounts {
  return { militia: 0, infantry: 0, ranged: 0, cavalry: 0, siege: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
