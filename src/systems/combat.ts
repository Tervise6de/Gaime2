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
  COMBAT_VARIANCE,
  FORT_PER_LEVEL,
  MAX_COMBAT_ROUNDS,
  MAX_ROUND_LOSS,
  ROUND_LETHALITY,
  VOLLEY_LETHALITY,
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

/**
 * A constant "mean" RNG (always 0.5) — the no-swing roll. Combat only draws
 * `next()`; the rest are conformant stubs. Used to forecast the *expected* fight.
 */
const MEAN_RNG: Rng = {
  next: () => 0.5,
  range: (min, max) => min + 0.5 * (max - min),
  int: (min, max) => Math.floor(min + 0.5 * (max - min + 1)),
  pick: <T>(items: readonly T[]): T => items[Math.floor(0.5 * items.length)]!,
  seed: 0,
};

export interface CombatForecast extends CombatPreview {
  /** Expected (mean-case) casualties for each side, per unit type. */
  attackerLosses: UnitCounts;
  defenderLosses: UnitCounts;
  /** Expected survivors on each side. */
  attackerRemaining: UnitCounts;
  defenderRemaining: UnitCounts;
  /** The mean-case outcome (the dice landing average). */
  likelyOutcome: BattleReport["outcome"];
}

/**
 * A richer, still non-destructive forecast: the win chance PLUS the expected
 * (mean-case, no-swing) casualties, survivors and outcome — so the player sees
 * not just the odds but the likely *price* of the attack, per unit type. Pure:
 * it runs the very resolver the sim uses, on a constant 0.5 RNG (no swing), so
 * the forecast can never drift from the real combat maths.
 */
export function forecastCombat(
  attacker: UnitCounts,
  defender: UnitCounts,
  ctx: CombatContext,
): CombatForecast {
  const preview = previewCombat(attacker, defender, ctx);
  const result = resolveCombat(attacker, defender, ctx, MEAN_RNG);
  return {
    ...preview,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    attackerRemaining: result.attackerRemaining,
    defenderRemaining: result.defenderRemaining,
    likelyOutcome: result.report.outcome,
  };
}

/** One resolved phase of a battle (an opening volley, or a melee round). */
export interface BattlePhase {
  kind: "volley" | "melee";
  /** 0 for the volley, 1-based for melee rounds. */
  round: number;
  attackerLosses: UnitCounts;
  defenderLosses: UnitCounts;
  /** Short human note ("Ranged volley softens the line", "Walls hold"). */
  note: string;
}

/** The full blow-by-blow of a fight, for the combat-report UI. Region/nation
    names are filled in by the caller (military.ts), which has the state. */
export interface BattleReport {
  regionName: string;
  terrainName: string;
  attackerName: string;
  defenderName: string;
  attackerIsPlayer: boolean;
  defenderIsPlayer: boolean;
  terrainDefense: number;
  fortification: number;
  /** Fortification remaining after the attacker's siege stripped it. */
  effectiveFort: number;
  attackerStart: UnitCounts;
  defenderStart: UnitCounts;
  attackerLosses: UnitCounts;
  defenderLosses: UnitCounts;
  attackerRemaining: UnitCounts;
  defenderRemaining: UnitCounts;
  phases: BattlePhase[];
  outcome: "captured" | "repelled" | "held";
  /** One-line summary of why it went the way it did. */
  decisive: string;
  /**
   * Soldiers the defender's neighbouring garrisons rallied into this fight
   * (combined defence, M2). 0 when the region stood alone; filled by the caller,
   * which knows the map. Counted inside `defenderStart`.
   */
  defenderReinforcements?: number;
}

export interface CombatResult {
  attackerLosses: UnitCounts;
  defenderLosses: UnitCounts;
  attackerRemaining: UnitCounts;
  defenderRemaining: UnitCounts;
  attackerWins: boolean;
  /** Defender wiped out → region can be captured. */
  captured: boolean;
  /** Blow-by-blow (names/region filled by the caller). */
  report: BattleReport;
}

export interface CombatContext {
  terrainDefense: number;
  fortification: number;
}

/** Opening-volley firepower: ranged attack + siege bombardment. */
function volleyPower(units: UnitCounts, opponent: UnitCounts): number {
  const oppTotal = armySize(opponent) || 1;
  let p = 0;
  for (const t of UNIT_TYPES) {
    const def = UNITS[t];
    if (!def.volley || !units[t]) continue;
    let mod = 1;
    if (def.counters) mod += COUNTER_BONUS * (opponent[def.counters] / oppTotal);
    p += units[t] * def.attack * mod;
  }
  return p;
}

/**
 * Resolve a battle as an opening volley (ranged + siege first strike) followed
 * by up to MAX_COMBAT_ROUNDS of melee attrition. Each melee round both sides
 * take casualties scaled by effective strength (counters, terrain, remaining
 * fort); the round's loser always sheds at least one regiment, so small fights
 * still decide. A wiped defender is captured; a wiped attacker is repelled;
 * survivors on both sides after the round cap means the defender held.
 * Deterministic — every roll comes from `rng`.
 */
export function resolveCombat(
  attacker: UnitCounts,
  defender: UnitCounts,
  ctx: CombatContext,
  rng: Rng,
): CombatResult {
  const attackerStart = { ...attacker };
  const defenderStart = { ...defender };
  const blank = (): BattleReport => ({
    regionName: "",
    terrainName: "",
    attackerName: "",
    defenderName: "",
    attackerIsPlayer: false,
    defenderIsPlayer: false,
    terrainDefense: ctx.terrainDefense,
    fortification: ctx.fortification,
    effectiveFort: 0,
    attackerStart,
    defenderStart,
    attackerLosses: zero(),
    defenderLosses: zero(),
    attackerRemaining: { ...attacker },
    defenderRemaining: { ...defender },
    phases: [],
    outcome: "held",
    decisive: "",
  });

  // Undefended region: walk in unopposed.
  if (armySize(defender) === 0) {
    const report = blank();
    report.effectiveFort = ctx.fortification;
    report.outcome = "captured";
    report.decisive = "Undefended — the army marched in unopposed.";
    return {
      attackerLosses: zero(),
      defenderLosses: zero(),
      attackerRemaining: { ...attacker },
      defenderRemaining: zero(),
      attackerWins: true,
      captured: true,
      report,
    };
  }

  const effFort = Math.max(0, ctx.fortification - siegePower(attacker));
  let atk: UnitCounts = { ...attacker };
  let def: UnitCounts = { ...defender };
  const phases: BattlePhase[] = [];
  const jitter = (): number => 1 + (rng.next() * 2 - 1) * COMBAT_VARIANCE;

  // --- Opening volley: ranged + siege fire before the lines meet ---
  const aVolley = volleyPower(atk, def);
  const dVolley = volleyPower(def, atk);
  if (aVolley > 0 || dVolley > 0) {
    const defHit = volleyLosses(def, aVolley, rng);
    const atkHit = volleyLosses(atk, dVolley, rng);
    atk = subtract(atk, atkHit);
    def = subtract(def, defHit);
    let note = "Arrows and stones fly before the lines close.";
    if (aVolley > dVolley * 1.5) note = "Your volley tears into their line before the clash.";
    else if (dVolley > aVolley * 1.5) note = "Their volley thins your ranks on the approach.";
    if (siegePower(attacker) > 0 && ctx.fortification > 0) {
      note += effFort < ctx.fortification ? " Siege engines batter the walls." : "";
    }
    phases.push({ kind: "volley", round: 0, attackerLosses: atkHit, defenderLosses: defHit, note });
  }

  // --- Melee rounds ---
  let outcome: BattleReport["outcome"] = "held";
  for (let round = 1; round <= MAX_COMBAT_ROUNDS; round++) {
    if (armySize(atk) === 0) { outcome = "repelled"; break; }
    if (armySize(def) === 0) { outcome = "captured"; break; }

    const atkPow = sideStrength(atk, def, "attack") * jitter();
    const defPow =
      sideStrength(def, atk, "defense") * ctx.terrainDefense * (1 + effFort * FORT_PER_LEVEL) * jitter();
    const total = atkPow + defPow || 1;
    const defFrac = clamp((ROUND_LETHALITY * atkPow) / total, 0, MAX_ROUND_LOSS);
    const atkFrac = clamp((ROUND_LETHALITY * defPow) / total, 0, MAX_ROUND_LOSS);

    // The round's loser always sheds at least one regiment, so the fight
    // converges even between tiny, evenly-matched stacks. The defender "holds"
    // the round when at least as strong, and it's the attacker who's thrown back.
    const defenderHeldRound = defPow >= atkPow;
    const defHit = scaleLosses(def, defFrac, !defenderHeldRound);
    const atkHit = scaleLosses(atk, atkFrac, defenderHeldRound);
    atk = subtract(atk, atkHit);
    def = subtract(def, defHit);
    phases.push({
      kind: "melee",
      round,
      attackerLosses: atkHit,
      defenderLosses: defHit,
      note: defenderHeldRound ? "The assault is thrown back." : "The defenders give ground.",
    });

    if (armySize(def) === 0) { outcome = "captured"; break; }
    if (armySize(atk) === 0) { outcome = "repelled"; break; }
  }

  const attackerLosses = subtract(attackerStart, atk);
  const defenderLosses = subtract(defenderStart, def);
  const attackerWins = outcome === "captured";

  const report = blank();
  report.effectiveFort = effFort;
  report.attackerLosses = attackerLosses;
  report.defenderLosses = defenderLosses;
  report.attackerRemaining = { ...atk };
  report.defenderRemaining = { ...def };
  report.phases = phases;
  report.outcome = outcome;
  report.decisive =
    outcome === "captured"
      ? "The defenders broke and the region fell."
      : outcome === "repelled"
        ? "The attacking army was destroyed."
        : ctx.fortification > 0 && effFort > 0
          ? "The walls held; the assault stalled and fell back."
          : "Neither side could break the other; the attack fell back.";

  return {
    attackerLosses,
    defenderLosses,
    attackerRemaining: { ...atk },
    defenderRemaining: { ...def },
    attackerWins,
    captured: attackerWins && armySize(def) === 0,
    report,
  };
}

/** Casualties an opening volley of `power` inflicts on `units`. */
function volleyLosses(units: UnitCounts, power: number, rng: Rng): UnitCounts {
  if (power <= 0) return zero();
  const size = armySize(units) || 1;
  const frac = clamp((VOLLEY_LETHALITY * power) / (size * 5), 0, MAX_ROUND_LOSS) * (1 + (rng.next() * 2 - 1) * COMBAT_VARIANCE);
  return scaleLosses(units, clamp(frac, 0, MAX_ROUND_LOSS), false);
}

/** Remove `frac` of each unit type; `atLeastOne` forces ≥1 total casualty. */
function scaleLosses(units: UnitCounts, frac: number, atLeastOne: boolean): UnitCounts {
  const out = zero();
  for (const t of UNIT_TYPES) out[t] = Math.min(units[t], Math.round(units[t] * frac));
  if (atLeastOne && armySize(out) === 0 && armySize(units) > 0) {
    // Shed one regiment of the most numerous surviving type.
    let best: UnitType | null = null;
    for (const t of UNIT_TYPES) if (units[t] > 0 && (best === null || units[t] > units[best])) best = t;
    if (best) out[best] = 1;
  }
  return out;
}

function subtract(a: UnitCounts, b: UnitCounts): UnitCounts {
  const out = zero();
  for (const t of UNIT_TYPES) out[t] = Math.max(0, a[t] - b[t]);
  return out;
}

function zero(): UnitCounts {
  const u = {} as UnitCounts;
  for (const t of UNIT_TYPES) u[t] = 0;
  return u;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
