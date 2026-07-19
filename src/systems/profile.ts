/**
 * Performance profiling harness (roadmap D4) — measures *where* a turn's
 * wall-clock goes at the largest configurations, so hot paths are measured, not
 * guessed.
 *
 * This is tooling, not sim logic: it observes the pure pipeline from the outside
 * with `performance.now()` and never feeds timing back into game state, so
 * determinism is untouched (the same guarantee the perf integration test relies
 * on). Two views:
 *   - `profileGame` / `summarizeGame` — the top line: per-turn `resolveTurn`
 *     cost across a full game, with an early-vs-late split to catch any
 *     superlinear growth as armies and territory pile up.
 *   - `profilePhases` — a micro-benchmark of the individually-exported hot phases
 *     on one representative state, to attribute the cost (the rival AI is the
 *     expected dominant term).
 */

import { createGame, resolveTurn, advanceNationEconomy, applySecession, type NewGameOptions } from "@/systems/turn";
import { runNationTurn } from "@/systems/ai";
import { driftRelations, decayOpinions } from "@/systems/diplomacy";
import { resolveChoice } from "@/systems/events";
import { createRng } from "@/systems/rng";
import { PLAYER_ID, TURN_LIMIT, type GameState } from "@/systems/state";

/** One turn's measured cost. */
export interface TurnTiming {
  turn: number;
  /** Living non-barbarian nations this turn. */
  nations: number;
  /** Armies on the board this turn. */
  armies: number;
  /** `runNationTurn` for the single harness-driven nation (one nation's AI). */
  drivenAiMs: number;
  /** `resolveTurn` — the rivals' AI plus every resolution phase. */
  resolveMs: number;
}

export interface ProfileResult {
  config: string;
  turns: number;
  timings: TurnTiming[];
  /** Total wall-clock of the profiled run (ms). */
  totalMs: number;
}

/**
 * Play one full game (AI driving every nation, the player included — the maximal
 * exercise), timing the driven nation's AI and `resolveTurn` each turn. Pure
 * apart from the timing it reports; deterministic in what it plays.
 */
export function profileGame(options: NewGameOptions, label = "profile"): ProfileResult {
  const timings: TurnTiming[] = [];
  const start = performance.now();
  let s = createGame(options);
  for (let t = 0; t < TURN_LIMIT + 5 && s.outcome === "playing"; t++) {
    const nations = s.nations.filter((n) => !n.isBarbarian && n.alive).length;
    const armies = s.armies.length;

    const a0 = performance.now();
    s = runNationTurn(s, PLAYER_ID, createRng(options.seed * 1000 + t));
    const drivenAiMs = performance.now() - a0;

    if (s.pendingChoice) s = resolveChoice(s, s.pendingChoice.options[0]!.id);

    const r0 = performance.now();
    s = resolveTurn(s);
    const resolveMs = performance.now() - r0;

    timings.push({ turn: s.turn, nations, armies, drivenAiMs, resolveMs });
  }
  return { config: label, turns: timings.length, timings, totalMs: performance.now() - start };
}

export interface ProfileSummary {
  config: string;
  turns: number;
  totalMs: number;
  /** Full-turn cost (driven AI + resolveTurn), in ms. */
  msPerTurn: { mean: number; p50: number; p95: number; max: number };
  /** Mean ms/turn over the first vs last quarter of the game — a superlinearity probe. */
  earlyMsPerTurn: number;
  lateMsPerTurn: number;
  /** Estimated share of a turn spent in rival AI (drivenAiMs scaled by nation count). */
  estAiSharePct: number;
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i]!;
}

/** Reduce a run to headline statistics. */
export function summarizeGame(r: ProfileResult): ProfileSummary {
  const per = r.timings.map((t) => t.drivenAiMs + t.resolveMs);
  const sorted = [...per].sort((a, b) => a - b);
  const mean = per.length ? per.reduce((a, b) => a + b, 0) / per.length : 0;
  const q = Math.max(1, Math.floor(r.timings.length / 4));
  const early = r.timings.slice(0, q);
  const late = r.timings.slice(-q);
  const meanOf = (ts: TurnTiming[]) =>
    ts.length ? ts.reduce((a, t) => a + t.drivenAiMs + t.resolveMs, 0) / ts.length : 0;
  // AI share: the driven nation is one of `nations`; assume the rivals cost about
  // the same each, so total AI ≈ drivenAiMs × nations of a full turn's cost.
  let aiNum = 0;
  let turnDen = 0;
  for (const t of r.timings) {
    aiNum += t.drivenAiMs * t.nations;
    turnDen += t.drivenAiMs + t.resolveMs;
  }
  return {
    config: r.config,
    turns: r.turns,
    totalMs: r.totalMs,
    msPerTurn: { mean, p50: pct(sorted, 50), p95: pct(sorted, 95), max: sorted[sorted.length - 1] ?? 0 },
    earlyMsPerTurn: meanOf(early),
    lateMsPerTurn: meanOf(late),
    estAiSharePct: turnDen > 0 ? Math.min(100, (aiNum / turnDen) * 100) : 0,
  };
}

/**
 * Play `options` up to `atTurn`, then return that mid-game state — a representative
 * late-game board (many armies, shifting fronts) for the per-phase micro-benchmark.
 */
export function stateAtTurn(options: NewGameOptions, atTurn: number): GameState {
  let s = createGame(options);
  for (let t = 0; t < atTurn && s.outcome === "playing"; t++) {
    s = runNationTurn(s, PLAYER_ID, createRng(options.seed * 1000 + t));
    if (s.pendingChoice) s = resolveChoice(s, s.pendingChoice.options[0]!.id);
    s = resolveTurn(s);
  }
  return s;
}

/**
 * Micro-benchmark the individually-exported hot phases on one representative
 * state, `iters` times each, returning mean ms per call. Attribution without
 * touching `resolveTurn` (which would risk the shared AI/event RNG stream).
 */
export function profilePhases(state: GameState, iters = 200): Record<string, number> {
  const rivals = state.nations.filter((n) => !n.isBarbarian && n.alive && !n.isPlayer);
  const time = (fn: () => unknown): number => {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn();
    return (performance.now() - t0) / iters;
  };
  const anyRival = rivals[0]?.id ?? PLAYER_ID;
  return {
    "runNationTurn(1 nation)": time(() => runNationTurn(state, anyRival, createRng(state.rngState))),
    advanceNationEconomy: time(() => advanceNationEconomy(state, anyRival)),
    driftRelations: time(() => driftRelations(state)),
    decayOpinions: time(() => decayOpinions(state)),
    applySecession: time(() => applySecession(state)),
  };
}
