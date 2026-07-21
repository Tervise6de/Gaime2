/**
 * Manufacture — the production chains that turn raw wares into dearer finished
 * ones (docs/hansa times.md §5; docs/game-design.md §Trade).
 *
 * The Hansa's wealth was not just gathering staples but *refining* them: English
 * and upland wool woven into the great western **cloth**, Wendish grain brewed into
 * hopped **beer**, Baltic pine worked into pitch, tar and cordage — **naval stores**.
 * A `convert` building (data/buildings.ts) draws its raw input from the realm's
 * pooled stockpile each turn and refines it 1:1 into the finished ware; the profit
 * is the finished ware's higher `value` at the Kontore. Hold the raw land *and*
 * build the refinery, or export the raw ware for far less — vertical integration is
 * the decision.
 *
 * Pure and deterministic: converts from the national ware pool, in a fixed
 * (from,to) key order, consuming only what is actually in stock (a converter with
 * no feedstock simply idles). Runs in the turn pipeline after ware production
 * accrues and before construction spends (systems/turn.ts).
 */

import { BUILDINGS } from "@/data/buildings";
import type { GoodId } from "@/data/goods";
import { round1 } from "@/systems/economy";
import type { Region, Wares } from "@/systems/state";

/** One chain's throughput this turn: `amount` of `from` refined into `to`. */
export interface ConvertFlow {
  from: GoodId;
  to: GoodId;
  amount: number;
}

/**
 * Refine a realm's wares through every `convert` building it owns. Conversion
 * capacity for each distinct `from → to` chain is pooled across the realm's
 * buildings, then met from the shared stockpile up to what is in stock. Returns the
 * new ware pool and the per-chain flows (for logging / UI). Pure — does not mutate.
 */
export function manufactureWares(
  wares: Wares,
  regions: Region[],
  nationId: number,
): { wares: Wares; flows: ConvertFlow[] } {
  // Pool each chain's per-turn capacity across all of the realm's converters.
  const cap = new Map<string, { from: GoodId; to: GoodId; per: number }>();
  for (const r of regions) {
    if (r.ownerId !== nationId) continue;
    for (const b of r.buildings) {
      const c = BUILDINGS[b]?.convert;
      if (!c) continue;
      const key = `${c.from}>${c.to}`;
      const entry = cap.get(key) ?? { from: c.from, to: c.to, per: 0 };
      entry.per += c.per;
      cap.set(key, entry);
    }
  }
  if (cap.size === 0) return { wares, flows: [] };

  let out: Wares = { ...wares };
  const flows: ConvertFlow[] = [];
  // Fixed key order so the result never depends on region/building iteration order.
  for (const key of [...cap.keys()].sort()) {
    const { from, to, per } = cap.get(key)!;
    const amount = Math.min(per, out[from]);
    if (amount <= 0) continue;
    out = { ...out, [from]: round1(out[from] - amount), [to]: round1(out[to] + amount) };
    flows.push({ from, to, amount: round1(amount) });
  }
  return { wares: out, flows };
}
