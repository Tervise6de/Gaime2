/**
 * Prosperity — domestic ware consumption (R5, docs/game-design.md R5).
 *
 * Until R5 the luxuries were export-only and the food-ware stockpile did nothing;
 * a realm produced them only to ship to a Kontor. This module gives those wares a
 * home use, drawn from the stockpile each turn:
 *
 *  - **Luxury contentment.** A Hansa town's burghers craved furs, fine cloth, wax
 *    candles, amber and wool. A realm's appetite scales with the population it
 *    governs; meeting it from the stockpile eases unrest across every province (a
 *    realm-wide carrot atop temples and low tax). Unmet demand costs nothing — it
 *    is forgone contentment, never a famine-style punishment (the anti-snowball
 *    brake stays unrest, by design).
 *
 *  - **The food reserve.** A food shortfall taps the food-ware stockpile (grain,
 *    salted fish, beer, honey) before it bites as famine — so a stocked or
 *    market-supplied larder rides out a lean turn. It only ever *reduces* famine.
 *
 * Pure over its inputs — no RNG, no DOM. `resolveContentment` / `drawFoodReserve`
 * do not mutate the `wares` they are handed; they return the amounts to spend.
 */

import { GOODS, contentmentWares, waresWithRole, type GoodId } from "@/data/goods";
import { round1 } from "@/systems/economy";
import { FISH_UNSALTED_MULT } from "@/systems/trade";
import {
  LUXURY_CONTENT_UNREST,
  LUXURY_DEMAND_PER_POP,
  type Wares,
} from "@/systems/state";

// --- luxury contentment -----------------------------------------------------

export interface Contentment {
  /** Luxury the realm craved this turn (scaled by governed population). */
  appetite: number;
  /** Luxury actually drawn from the stockpile to meet it. */
  consumed: number;
  /** Fraction of the appetite met, 0..1 (1 when there is no appetite). */
  ratio: number;
  /** Per-ware amounts to draw from the stockpile (for the caller to spend). */
  spent: Partial<Record<GoodId, number>>;
}

/** A realm's per-turn luxury appetite for a governed population of `pop`. */
export function luxuryAppetite(pop: number): number {
  return round1(Math.max(0, pop) * LUXURY_DEMAND_PER_POP);
}

/**
 * Resolve luxury contentment for a stockpile against an `appetite`: draw the
 * contentment wares (furs/wax/amber/cloth/wool) proportionally to what's present,
 * so no single ware is drained first, up to the appetite. Returns the amounts to
 * spend and the contentment ratio. Pure — never draws more of a ware than is held.
 */
export function resolveContentment(wares: Wares, appetite: number): Contentment {
  if (appetite <= 0) return { appetite: 0, consumed: 0, ratio: 1, spent: {} };
  const basket = contentmentWares();
  const available = round1(basket.reduce((sum, id) => sum + wares[id], 0));
  if (available <= 0) return { appetite, consumed: 0, ratio: 0, spent: {} };

  const consumed = Math.min(appetite, available);
  const spent: Partial<Record<GoodId, number>> = {};
  for (const id of basket) {
    if (wares[id] <= 0) continue;
    // Proportional share; ≤ wares[id] since consumed ≤ available, so never over-draws.
    spent[id] = round1(consumed * (wares[id] / available));
  }
  return { appetite, consumed: round1(consumed), ratio: Math.min(1, consumed / appetite), spent };
}

/** Realm-wide unrest reduction from a contentment ratio (0 at none → LUXURY_CONTENT_UNREST at full). */
export function contentmentUnrest(ratio: number): number {
  return round1(Math.max(0, Math.min(1, ratio)) * LUXURY_CONTENT_UNREST);
}

// --- the food reserve -------------------------------------------------------

export interface FoodReserveDraw {
  /** The reduced stockpile after the reserve was tapped. */
  wares: Wares;
  /** Food produced from the reserve this turn (≥ 0). */
  food: number;
}

/**
 * Draw food from the food-ware stockpile to cover a shortfall of `need` food.
 * Consumes food wares (grain, salted fish, beer, honey) in GOOD_IDS order — each
 * unit worth its `foodValue`, fish cut to FISH_UNSALTED_MULT without salt to
 * preserve it (the same salt→fish chain as production) — until `need` is met or
 * the reserve runs dry. Returns the reduced stockpile and the food produced. Pure.
 */
export function drawFoodReserve(wares: Wares, need: number, salted: boolean): FoodReserveDraw {
  if (need <= 0) return { wares, food: 0 };
  const out = { ...wares };
  let produced = 0; // summed unrounded; rounded once at the end to avoid drift
  for (const id of waresWithRole("food")) {
    if (produced >= need) break;
    const fv = GOODS[id].foodValue ?? 0;
    if (fv <= 0 || out[id] <= 0) continue;
    const fish = id === "herring" || id === "stockfish";
    const perUnit = fv * (fish && !salted ? FISH_UNSALTED_MULT : 1);
    if (perUnit <= 0) continue;
    const take = Math.min(out[id], (need - produced) / perUnit);
    out[id] = round1(out[id] - take);
    produced += take * perUnit;
  }
  return { wares: out, food: round1(produced) };
}
