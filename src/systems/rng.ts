/**
 * Seeded pseudo-random number generator.
 *
 * Determinism is a hard design rule (see docs/game-design.md §7): map
 * generation, AI, and combat must all be reproducible from a single seed so
 * the sim is testable and seeds are shareable. Game logic must therefore use
 * this generator and never `Math.random()`.
 *
 * `mulberry32` is a small, fast, well-distributed 32-bit generator — more than
 * good enough for a game, and trivial to reason about.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Pick a random element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** The raw 32-bit seed this generator is currently at. */
  readonly seed: number;
}

/** Hash an arbitrary string into a 32-bit unsigned integer seed. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(min: number, max: number): number {
      return min + next() * (max - min);
    },
    int(min: number, max: number): number {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty array");
      }
      return items[Math.floor(next() * items.length)]!;
    },
    get seed(): number {
      return state;
    },
  };
}
