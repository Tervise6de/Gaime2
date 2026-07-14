/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * The entire simulation is deterministic: given the same seed and the same
 * sequence of orders, the game unfolds identically. This is mandatory — no
 * `Math.random()` may appear in game logic. The generator's cursor lives in
 * `GameState.rngState`, so serialising the state captures the full RNG position.
 */

export interface Rng {
  /** Next float in [0, 1). Advances the cursor. */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Pick a random element (returns undefined for an empty array). */
  pick<T>(items: readonly T[]): T | undefined;
  /** In-place Fisher–Yates shuffle; returns the same array for chaining. */
  shuffle<T>(items: T[]): T[];
  /** Current internal cursor — persist this back into GameState. */
  state(): number;
}

/** Create an RNG resuming from a given cursor (defaults to the seed itself). */
export function createRng(seed: number, cursor?: number): Rng {
  let a = (cursor ?? seed) >>> 0;

  function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const rng: Rng = {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    pick(items) {
      if (items.length === 0) return undefined;
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
    state() {
      return a >>> 0;
    },
  };
  return rng;
}
