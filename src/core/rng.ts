/**
 * Seeded pseudo-random number generator.
 *
 * The whole simulation is required to be deterministic (see the game design
 * doc, §7): identical seeds must reproduce identical maps, AI decisions, and
 * event rolls. Therefore game logic must NEVER call `Math.random()` — it draws
 * exclusively from an {@link Rng} created here.
 *
 * We use mulberry32: a tiny, fast 32-bit generator with good-enough statistical
 * quality for a game and, crucially, a fully serialisable state (a single
 * 32-bit integer). That lets us snapshot and restore the RNG as part of
 * `GameState`.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability `p` (0..1). */
  chance(p: number): boolean;
  /** Uniformly pick an element (throws on empty array). */
  pick<T>(items: readonly T[]): T;
  /**
   * Current internal state as a 32-bit unsigned integer. Persist this in
   * `GameState` to resume the exact same stream later.
   */
  state(): number;
}

/** Force a value into an unsigned 32-bit integer. */
function toUint32(seed: number): number {
  return seed >>> 0;
}

/**
 * Derive a well-distributed 32-bit seed from an arbitrary (possibly small or
 * sequential) input, so callers can pass friendly seeds like `1`, `2`, `3` and
 * still get uncorrelated streams. This is the mulberry32 mixing step applied
 * once.
 */
export function hashSeed(input: number): number {
  let h = toUint32(Math.trunc(input));
  h = (h + 0x6d2b79f5) | 0;
  let t = Math.imul(h ^ (h >>> 15), 1 | h);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * Create an RNG from a raw 32-bit state value. Prefer {@link createRng} for new
 * generators (it hashes the seed); use this to resume a persisted RNG state.
 */
export function rngFromState(state: number): Rng {
  let a = toUint32(state);

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(minInclusive: number, maxExclusive: number): number {
      if (maxExclusive <= minInclusive) return minInclusive;
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    range(min: number, max: number): number {
      return min + next() * (max - min);
    },
    chance(p: number): boolean {
      return next() < p;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Rng.pick called with an empty array");
      }
      return items[Math.floor(next() * items.length)]!;
    },
    state(): number {
      return a >>> 0;
    },
  };
}

/** Create a fresh RNG from a friendly seed (any number). */
export function createRng(seed: number): Rng {
  return rngFromState(hashSeed(seed));
}
